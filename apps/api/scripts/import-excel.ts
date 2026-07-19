import * as XLSX from 'xlsx';
import { PrismaClient, CandidateStatus, ClientStatus, JobOrderStatus, SubmissionStatus, PlacementStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { dataFile } from './data-dir';

const prisma = new PrismaClient();

// File paths (see apps/api/data; override the location with DATA_DIR)
const CANDIDATE_FILE = dataFile('Icarus Candidate Database.xlsx');
const CLIENT_FILE = dataFile('Icarus Client Database.xlsx');
const JOB_ORDER_FILE = dataFile('Job Orders Portfolio.xlsx');

// Helper to parse Excel dates (Excel stores dates as numbers)
function parseExcelDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === 'number') {
    // Excel date serial number (days since 1900-01-01, with a bug for 1900 leap year)
    const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
    return new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

// Client.notes is now a JSONB timeline ([{id, content, timestamp, by, editedAt, editedBy}])
// — wraps a single legacy free-text value as its first (only) entry. `by` is
// null since imported notes have no consultant attribution.
function toNoteTimeline(content: string | null) {
  return content
    ? [
        {
          id: randomUUID(),
          content,
          timestamp: new Date().toISOString(),
          by: null,
          editedAt: null,
          editedBy: null,
        },
      ]
    : undefined;
}

// Helper to clean string values
function cleanString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

// Map status strings to enums
function mapCandidateStatus(status: string | null): CandidateStatus {
  if (!status) return CandidateStatus.COLD;
  const s = status.toLowerCase().trim();
  if (s.includes('hot')) return CandidateStatus.HOT;
  if (s.includes('warm')) return CandidateStatus.WARM;
  if (s.includes('placed')) return CandidateStatus.PLACED;
  return CandidateStatus.COLD;
}

function mapClientStatus(status: string | null): ClientStatus {
  if (!status) return ClientStatus.COLD;
  const s = status.toLowerCase().trim();
  if (s.includes('traded')) return ClientStatus.TRADED;
  if (s.includes('warm')) return ClientStatus.WARM;
  return ClientStatus.COLD;
}

function mapJobOrderStatus(status: string | null): JobOrderStatus {
  if (!status) return JobOrderStatus.ACTIVE;
  const s = status.toLowerCase().trim();
  if (s.includes('placed')) return JobOrderStatus.PLACED;
  if (s.includes('closed')) return JobOrderStatus.CLOSED;
  if (s.includes('hold')) return JobOrderStatus.ON_HOLD;
  return JobOrderStatus.ACTIVE;
}

// Read sheet as array of objects
function readSheet<T>(workbook: XLSX.WorkBook, sheetName: string): T[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    console.warn(`  Sheet "${sheetName}" not found`);
    return [];
  }
  return XLSX.utils.sheet_to_json<T>(sheet);
}

// ============================================================================
// IMPORT FUNCTIONS
// ============================================================================

async function importConsultants() {
  console.log('\n📥 Importing Consultants...');
  const workbook = XLSX.readFile(JOB_ORDER_FILE);
  const rows = readSheet<{
    consultantID: string;
    consultant: string;
    industry?: string;
  }>(workbook, 'Manager Interface');

  let created = 0;
  for (const row of rows) {
    const displayId = cleanString(row.consultantID);
    const fullName = cleanString(row.consultant);

    if (!displayId || !fullName) continue;

    try {
      await prisma.consultant.upsert({
        where: { displayId },
        create: {
          displayId,
          fullName,
          email: `${fullName.toLowerCase().replace(/\s+/g, '.')}@linktal.com.au`,
        },
        update: { fullName },
      });
      created++;
    } catch (err) {
      console.error(`  Error importing consultant ${displayId}:`, err);
    }
  }
  console.log(`  ✅ Imported ${created} consultants`);
}

async function importClients() {
  console.log('\n📥 Importing Clients...');
  const workbook = XLSX.readFile(CLIENT_FILE);
  const rows = readSheet<{
    'ClientID (Primary Key)': string;
    Country?: string;
    Industry?: string;
    City?: string;
    Suburb?: string;
    'Company Name'?: string;
    Website?: string;
    Notes?: string;
    'Status '?: string;
    'Fee Schedule '?: string;
    'Guarantee Period '?: number;
  }>(workbook, 'Client Company Info');

  let created = 0;
  for (const row of rows) {
    const displayId = cleanString(row['ClientID (Primary Key)']);
    const companyName = cleanString(row['Company Name']);

    if (!displayId || !companyName) continue;

    // Parse fee percentage from "Fee Schedule" if available
    let feePercentage: number | null = null;
    const feeSchedule = cleanString(row['Fee Schedule ']);
    if (feeSchedule) {
      const match = feeSchedule.match(/(\d+)/);
      if (match) feePercentage = parseInt(match[1], 10);
    }

    // Industry is now a reference table, not free text — upsert-by-name to
    // reuse an existing row (or create one) and link by id.
    const industryName = cleanString(row.Industry);
    const industryId = industryName
      ? (
          await prisma.industry.upsert({
            where: { name: industryName },
            create: { name: industryName },
            update: {},
          })
        ).id
      : undefined;

    try {
      await prisma.client.upsert({
        where: { displayId },
        create: {
          displayId,
          companyName,
          country: cleanString(row.Country),
          industryId,
          city: cleanString(row.City),
          website: cleanString(row.Website),
          notes: toNoteTimeline(cleanString(row.Notes)),
          status: mapClientStatus(cleanString(row['Status '])),
          feePercentage,
          guaranteePeriod: row['Guarantee Period '] || 90,
        },
        update: {
          companyName,
          country: cleanString(row.Country),
          industryId,
          city: cleanString(row.City),
          status: mapClientStatus(cleanString(row['Status '])),
        },
      });
      created++;
    } catch (err) {
      console.error(`  Error importing client ${displayId}:`, err);
    }
  }
  console.log(`  ✅ Imported ${created} clients`);
}

async function importStakeholders() {
  console.log('\n📥 Importing Stakeholders...');
  const workbook = XLSX.readFile(CLIENT_FILE);
  const rows = readSheet<{
    'ClientID(Foreign Key)': string;
    'StakeholderID (Primary key)': string;
    'Full Name'?: string;
    'Given Name'?: string;
    'Family Name'?: string;
    'Current position'?: string;
    email?: string;
    mobile?: string;
    'linkedin URL'?: string;
  }>(workbook, 'Client Stakeholder Info');

  let created = 0;
  for (const row of rows) {
    const displayId = cleanString(row['StakeholderID (Primary key)']);
    const clientDisplayId = cleanString(row['ClientID(Foreign Key)']);
    const fullName = cleanString(row['Full Name']);

    if (!displayId || !clientDisplayId || !fullName) continue;

    // Find the client
    const client = await prisma.client.findUnique({
      where: { displayId: clientDisplayId },
    });
    if (!client) {
      console.warn(`  Client ${clientDisplayId} not found for stakeholder ${displayId}`);
      continue;
    }

    try {
      await prisma.stakeholder.upsert({
        where: { displayId },
        create: {
          displayId,
          clientId: client.id,
          fullName,
          jobTitle: cleanString(row['Current position']),
          email: cleanString(row.email),
          mobile: cleanString(row.mobile),
        },
        update: {
          fullName,
          jobTitle: cleanString(row['Current position']),
          email: cleanString(row.email),
          mobile: cleanString(row.mobile),
        },
      });
      created++;
    } catch (err) {
      console.error(`  Error importing stakeholder ${displayId}:`, err);
    }
  }
  console.log(`  ✅ Imported ${created} stakeholders`);
}

async function importStakeholderContactHistory() {
  console.log('\n📥 Importing Stakeholder Contact History...');
  const workbook = XLSX.readFile(CLIENT_FILE);
  const rows = readSheet<{
    'StakeholderID (Foreign Key)': string;
    'last contact date'?: number;
    'contacted by'?: string;
    'contacted history (save outbound, inbound emails, To be confirmed) '?: string;
  }>(workbook, 'Stakeholder Contact History');

  let created = 0;
  for (const row of rows) {
    const stakeholderDisplayId = cleanString(row['StakeholderID (Foreign Key)']);
    if (!stakeholderDisplayId) continue;

    const stakeholder = await prisma.stakeholder.findUnique({
      where: { displayId: stakeholderDisplayId },
    });
    if (!stakeholder) {
      console.warn(`  Stakeholder ${stakeholderDisplayId} not found`);
      continue;
    }

    const contactedAt = parseExcelDate(row['last contact date']);
    if (!contactedAt) continue;

    try {
      await prisma.stakeholderContactHistory.create({
        data: {
          stakeholderId: stakeholder.id,
          contactType: 'unknown',
          notes: cleanString(row['contacted history (save outbound, inbound emails, To be confirmed) ']),
          contactedAt,
        },
      });
      created++;
    } catch (err) {
      console.error(`  Error importing contact history for ${stakeholderDisplayId}:`, err);
    }
  }
  console.log(`  ✅ Imported ${created} contact history records`);
}

async function importClientJobResearch() {
  console.log('\n📥 Importing Client Job Research...');
  const workbook = XLSX.readFile(CLIENT_FILE);
  const rows = readSheet<{
    ClientID: string;
    'Job Title'?: string;
    'Role Type'?: string;
    Salary?: string;
    'Permanent URL'?: string;
    'posted date'?: number;
  }>(workbook, 'Client Job Opening Research');

  let created = 0;
  for (const row of rows) {
    const clientDisplayId = cleanString(row.ClientID);
    const jobTitle = cleanString(row['Job Title']);

    if (!clientDisplayId || !jobTitle) continue;

    const client = await prisma.client.findUnique({
      where: { displayId: clientDisplayId },
    });
    if (!client) {
      console.warn(`  Client ${clientDisplayId} not found for job research`);
      continue;
    }

    try {
      await prisma.clientJobResearch.create({
        data: {
          clientId: client.id,
          jobTitle,
          sourceUrl: cleanString(row['Permanent URL']),
          salaryRange: cleanString(row.Salary),
          researchedAt: parseExcelDate(row['posted date']) || new Date(),
        },
      });
      created++;
    } catch (err) {
      console.error(`  Error importing job research:`, err);
    }
  }
  console.log(`  ✅ Imported ${created} job research records`);
}

async function importCandidates() {
  console.log('\n📥 Importing Candidates...');
  const workbook = XLSX.readFile(CANDIDATE_FILE);
  const rows = readSheet<{
    CandidateID: string;
    'Full Name'?: string;
    'Given Name'?: string;
    'Family Name'?: string;
    Email?: string;
    Mobile?: string;
    Country?: string;
    'City '?: string;
    'Industry '?: string;
    'Role Type'?: string;
    'Linkedln URL'?: string;
    'Company_1 (Latest)'?: string;
    'Role_1 (Latest)'?: string;
    'Tenure_1 (Date)  (Latest)'?: string;
    Company_2?: string;
    Role_2?: string;
    Tenure_2?: string;
    Company_3?: string;
    Role_3?: string;
    Tenure_3?: string;
    'Status '?: string;
    Specialization_1?: string;
    Specialization_2?: string;
    Specialization_3?: string;
  }>(workbook, 'Candidate Basic Info ');

  let created = 0;
  for (const row of rows) {
    const displayId = cleanString(row.CandidateID);
    const fullName = cleanString(row['Full Name']) || cleanString(row['Given Name']);

    if (!displayId || !fullName) continue;

    // Build work history array
    const workHistory: { company: string; role: string; tenure?: string }[] = [];
    if (row['Company_1 (Latest)']) {
      workHistory.push({
        company: row['Company_1 (Latest)'],
        role: row['Role_1 (Latest)'] || '',
        tenure: row['Tenure_1 (Date)  (Latest)'],
      });
    }
    if (row.Company_2) {
      workHistory.push({
        company: row.Company_2,
        role: row.Role_2 || '',
        tenure: row.Tenure_2,
      });
    }
    if (row.Company_3) {
      workHistory.push({
        company: row.Company_3,
        role: row.Role_3 || '',
        tenure: row.Tenure_3,
      });
    }

    // Build specializations array
    const specializations: string[] = [];
    if (row.Specialization_1) specializations.push(row.Specialization_1);
    if (row.Specialization_2) specializations.push(row.Specialization_2);
    if (row.Specialization_3) specializations.push(row.Specialization_3);

    try {
      await prisma.candidate.upsert({
        where: { displayId },
        create: {
          displayId,
          fullName,
          givenName: cleanString(row['Given Name']),
          familyName: cleanString(row['Family Name']),
          email: cleanString(row.Email),
          mobile: cleanString(row.Mobile),
          country: cleanString(row.Country),
          city: cleanString(row['City ']),
          industry: cleanString(row['Industry ']),
          roleType: cleanString(row['Role Type']),
          linkedinUrl: cleanString(row['Linkedln URL']),
          currentCompany: cleanString(row['Company_1 (Latest)']),
          currentPosition: cleanString(row['Role_1 (Latest)']),
          workHistory: workHistory.length > 0 ? workHistory : undefined,
          specializations: specializations.length > 0 ? specializations : undefined,
          status: mapCandidateStatus(cleanString(row['Status '])),
        },
        update: {
          fullName,
          email: cleanString(row.Email),
          mobile: cleanString(row.Mobile),
          status: mapCandidateStatus(cleanString(row['Status '])),
        },
      });
      created++;
    } catch (err) {
      console.error(`  Error importing candidate ${displayId}:`, err);
    }
  }
  console.log(`  ✅ Imported ${created} candidates`);
}

async function importCandidateScreeningHistory() {
  console.log('\n📥 Importing Candidate Screening History...');
  const workbook = XLSX.readFile(CANDIDATE_FILE);
  const rows = readSheet<{
    'CandidateID(Lookup)': string;
    'screen date(auto input)'?: number;
    'Reason of Looking Out'?: string;
    'Current Salary'?: string;
    'Expected Salary'?: string;
    'Notes1 (pop out from right side panel) '?: string;
    Notes2?: string;
    Notes3?: string;
  }>(workbook, 'Candidate Screening History ');

  let created = 0;
  for (const row of rows) {
    const candidateDisplayId = cleanString(row['CandidateID(Lookup)']);
    if (!candidateDisplayId) continue;

    const candidate = await prisma.candidate.findUnique({
      where: { displayId: candidateDisplayId },
    });
    if (!candidate) {
      console.warn(`  Candidate ${candidateDisplayId} not found`);
      continue;
    }

    // Build notes array
    const notes: { text: string; type?: string }[] = [];
    if (row['Reason of Looking Out']) {
      notes.push({ text: `Reason: ${row['Reason of Looking Out']}`, type: 'reason' });
    }
    if (row['Current Salary'] || row['Expected Salary']) {
      notes.push({
        text: `Salary: Current ${row['Current Salary'] || 'N/A'}, Expected ${row['Expected Salary'] || 'N/A'}`,
        type: 'salary',
      });
    }
    if (row['Notes1 (pop out from right side panel) ']) {
      notes.push({ text: row['Notes1 (pop out from right side panel) '], type: 'note' });
    }
    if (row.Notes2) notes.push({ text: row.Notes2, type: 'note' });
    if (row.Notes3) notes.push({ text: row.Notes3, type: 'note' });

    if (notes.length === 0) continue;

    const screenedAt = parseExcelDate(row['screen date(auto input)']);

    try {
      await prisma.candidateScreeningHistory.create({
        data: {
          candidateId: candidate.id,
          notes,
          screenedAt: screenedAt || new Date(),
        },
      });
      created++;
    } catch (err) {
      console.error(`  Error importing screening history for ${candidateDisplayId}:`, err);
    }
  }
  console.log(`  ✅ Imported ${created} screening history records`);
}

async function importJobOrders() {
  console.log('\n📥 Importing Job Orders...');
  const workbook = XLSX.readFile(JOB_ORDER_FILE);
  const rows = readSheet<{
    'Consultant ': string;
    'Company (Client ID lookup)': string;
    'Job Title': string;
    'Numbers of Openings'?: number;
    'City (lookup)'?: string;
    'Job Created Date'?: number;
    'Status (optional) '?: string;
    'Salary Offered '?: string;
    'Fee Value '?: number;
  }>(workbook, 'Consultant Job Order');

  let created = 0;
  let orderNum = 1;

  for (const row of rows) {
    const jobTitle = cleanString(row['Job Title']);
    const companyName = cleanString(row['Company (Client ID lookup)']);

    if (!jobTitle || !companyName) continue;

    // Find client by company name
    const client = await prisma.client.findFirst({
      where: { companyName },
    });
    if (!client) {
      console.warn(`  Client "${companyName}" not found for job order`);
      continue;
    }

    // Find consultant by name
    const consultantName = cleanString(row['Consultant ']);
    let consultant = null;
    if (consultantName) {
      consultant = await prisma.consultant.findFirst({
        where: { fullName: { contains: consultantName, mode: 'insensitive' } },
      });
    }

    const displayId = `JO-${String(orderNum).padStart(4, '0')}`;
    orderNum++;

    try {
      await prisma.jobOrder.create({
        data: {
          displayId,
          clientId: client.id,
          consultantId: consultant?.id,
          jobTitle,
          location: cleanString(row['City (lookup)']),
          openings: row['Numbers of Openings'] || 1,
          status: mapJobOrderStatus(cleanString(row['Status (optional) '])),
          receivedAt: parseExcelDate(row['Job Created Date']) || new Date(),
        },
      });
      created++;
    } catch (err) {
      console.error(`  Error importing job order:`, err);
    }
  }
  console.log(`  ✅ Imported ${created} job orders`);
}

// Helper to ensure a client and job order exist for a company name
async function ensureClientAndJobOrder(companyName: string): Promise<{ clientId: string; jobOrderId: string } | null> {
  // Try to find existing client (case-insensitive)
  let client = await prisma.client.findFirst({
    where: { companyName: { equals: companyName, mode: 'insensitive' } },
  });

  // If not found, create a new client
  if (!client) {
    const clientCount = await prisma.client.count();
    const displayId = `Client-${String(clientCount + 1).padStart(4, '0')}`;

    client = await prisma.client.create({
      data: {
        displayId,
        companyName,
        status: 'WARM', // They have submissions, so at least warm
        notes: toNoteTimeline('Auto-created from Job Interviewing History import'),
      },
    });
    console.log(`  📝 Created missing client: ${companyName} (${displayId})`);
  }

  // Try to find existing job order for this client
  let jobOrder = await prisma.jobOrder.findFirst({
    where: { clientId: client.id },
  });

  // If not found, create a generic job order
  if (!jobOrder) {
    const jobOrderCount = await prisma.jobOrder.count();
    const displayId = `JO-${String(jobOrderCount + 1).padStart(4, '0')}`;

    jobOrder = await prisma.jobOrder.create({
      data: {
        displayId,
        clientId: client.id,
        jobTitle: 'General Position', // Generic title
        status: 'ACTIVE',
      },
    });
    console.log(`  📝 Created job order for ${companyName} (${displayId})`);
  }

  return { clientId: client.id, jobOrderId: jobOrder.id };
}

async function importSubmissionsAndPlacements() {
  console.log('\n📥 Importing Submissions & Placements...');
  const workbook = XLSX.readFile(CANDIDATE_FILE);
  const rows = readSheet<{
    CandidateID: string;
    'Companies Submitted '?: string;
    'Companies Placed into '?: string;
    'submitted date'?: number;
    'interview date'?: number;
    'placement date'?: number;
  }>(workbook, 'Job Interviewing History');

  let submissionsCreated = 0;
  let placementsCreated = 0;
  let clientsCreated = 0;

  for (const row of rows) {
    const candidateDisplayId = cleanString(row.CandidateID);
    const companySubmitted = cleanString(row['Companies Submitted ']);

    if (!candidateDisplayId || !companySubmitted) continue;

    // Find candidate
    const candidate = await prisma.candidate.findUnique({
      where: { displayId: candidateDisplayId },
    });
    if (!candidate) {
      console.warn(`  Candidate ${candidateDisplayId} not found`);
      continue;
    }

    // Ensure client and job order exist (create if missing)
    const result = await ensureClientAndJobOrder(companySubmitted);
    if (!result) {
      console.warn(`  Failed to create client/job order for "${companySubmitted}"`);
      continue;
    }

    const { jobOrderId } = result;

    // Check if submission already exists
    const existing = await prisma.candidateSubmission.findUnique({
      where: {
        candidateId_jobOrderId: {
          candidateId: candidate.id,
          jobOrderId,
        },
      },
    });
    if (existing) continue;

    const companyPlaced = cleanString(row['Companies Placed into ']);
    const isPlaced = companyPlaced && companyPlaced.toLowerCase() === companySubmitted.toLowerCase();

    try {
      const submission = await prisma.candidateSubmission.create({
        data: {
          candidateId: candidate.id,
          jobOrderId,
          status: isPlaced ? SubmissionStatus.PLACED : SubmissionStatus.SUBMITTED,
          submittedAt: parseExcelDate(row['submitted date']) || new Date(),
        },
      });
      submissionsCreated++;

      // Create placement if placed
      if (isPlaced) {
        const startDate = parseExcelDate(row['placement date']);
        const guaranteeEndDate = startDate
          ? new Date(startDate.getTime() + 90 * 24 * 60 * 60 * 1000)
          : null;

        await prisma.placement.create({
          data: {
            submissionId: submission.id,
            startDate,
            guaranteeEndDate,
            status: PlacementStatus.ACTIVE,
          },
        });
        placementsCreated++;
      }
    } catch (err) {
      console.error(`  Error importing submission:`, err);
    }
  }
  console.log(`  ✅ Imported ${submissionsCreated} submissions, ${placementsCreated} placements`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🚀 Starting Excel Import...\n');
  console.log('Files:');
  console.log(`  - ${CANDIDATE_FILE}`);
  console.log(`  - ${CLIENT_FILE}`);
  console.log(`  - ${JOB_ORDER_FILE}`);

  try {
    // Import in dependency order
    await importConsultants();
    await importClients();
    await importStakeholders();
    await importStakeholderContactHistory();
    await importClientJobResearch();
    await importCandidates();
    await importCandidateScreeningHistory();
    await importJobOrders();
    await importSubmissionsAndPlacements();

    console.log('\n✅ Import completed successfully!');
  } catch (err) {
    console.error('\n❌ Import failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
