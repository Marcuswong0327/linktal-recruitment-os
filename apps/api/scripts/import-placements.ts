import * as XLSX from 'xlsx';
import { PrismaClient, SubmissionStatus, PlacementStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { dataFile } from './data-dir';

const prisma = new PrismaClient();
const CANDIDATE_FILE = dataFile('Icarus Candidate Database.xlsx');

function parseExcelDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function cleanString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
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

function readSheet<T>(workbook: XLSX.WorkBook, sheetName: string): T[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<T>(sheet);
}

async function ensureClientAndJobOrder(companyName: string): Promise<{ clientId: string; jobOrderId: string } | null> {
  let client = await prisma.client.findFirst({
    where: { companyName: { equals: companyName, mode: 'insensitive' } },
  });

  if (!client) {
    const clientCount = await prisma.client.count();
    const displayId = `Client-${String(clientCount + 1).padStart(4, '0')}`;

    client = await prisma.client.create({
      data: {
        displayId,
        companyName,
        status: 'WARM',
        notes: toNoteTimeline('Auto-created from Job Interviewing History import'),
      },
    });
    console.log(`  📝 Created missing client: ${companyName} (${displayId})`);
  }

  let jobOrder = await prisma.jobOrder.findFirst({
    where: { clientId: client.id },
  });

  if (!jobOrder) {
    const jobOrderCount = await prisma.jobOrder.count();
    const displayId = `JO-${String(jobOrderCount + 1).padStart(4, '0')}`;

    jobOrder = await prisma.jobOrder.create({
      data: {
        displayId,
        clientId: client.id,
        jobTitle: 'General Position',
        status: 'ACTIVE',
      },
    });
    console.log(`  📝 Created job order for ${companyName} (${displayId})`);
  }

  return { clientId: client.id, jobOrderId: jobOrder.id };
}

async function main() {
  console.log('🚀 Importing Submissions & Placements...\n');

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

  for (const row of rows) {
    const candidateDisplayId = cleanString(row.CandidateID);
    const companySubmitted = cleanString(row['Companies Submitted ']);

    if (!candidateDisplayId || !companySubmitted) continue;

    const candidate = await prisma.candidate.findUnique({
      where: { displayId: candidateDisplayId },
    });
    if (!candidate) {
      console.warn(`  ⚠️ Candidate ${candidateDisplayId} not found`);
      continue;
    }

    const result = await ensureClientAndJobOrder(companySubmitted);
    if (!result) continue;

    const { jobOrderId } = result;

    const existing = await prisma.candidateSubmission.findUnique({
      where: {
        candidateId_jobOrderId: {
          candidateId: candidate.id,
          jobOrderId,
        },
      },
    });
    if (existing) {
      console.log(`  ⏭️ Submission already exists: ${candidateDisplayId} → ${companySubmitted}`);
      continue;
    }

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
      console.log(`  ✅ Submission: ${candidateDisplayId} → ${companySubmitted}`);

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
        console.log(`  🎉 Placement: ${candidateDisplayId} placed at ${companySubmitted}`);
      }
    } catch (err) {
      console.error(`  ❌ Error:`, err);
    }
  }

  console.log(`\n✅ Done! Created ${submissionsCreated} submissions, ${placementsCreated} placements`);

  // Show summary
  const totalSubmissions = await prisma.candidateSubmission.count();
  const totalPlacements = await prisma.placement.count();
  console.log(`\n📊 Total in database: ${totalSubmissions} submissions, ${totalPlacements} placements`);

  await prisma.$disconnect();
}

main();
