import * as XLSX from 'xlsx';
import { dataFile } from './data-dir';

const CANDIDATE_FILE = dataFile('Icarus Candidate Database.xlsx');
const CLIENT_FILE = dataFile('Icarus Client Database.xlsx');

// Get all client company names
const clientWorkbook = XLSX.readFile(CLIENT_FILE);
const clientSheet = clientWorkbook.Sheets['Client Company Info'];
const clients = XLSX.utils.sheet_to_json<{ 'Company Name': string }>(clientSheet);
const clientNames = new Set(clients.map(c => c['Company Name']?.toLowerCase().trim()).filter(Boolean));

console.log('=== Client Company Names ===');
console.log([...clientNames].sort().join('\n'));

// Get all company names from Job Interviewing History
const candidateWorkbook = XLSX.readFile(CANDIDATE_FILE);
const historySheet = candidateWorkbook.Sheets['Job Interviewing History'];
const history = XLSX.utils.sheet_to_json<{
  'Companies Submitted ': string;
  'Companies Placed into ': string;
}>(historySheet);

const submittedCompanies = new Set<string>();
const placedCompanies = new Set<string>();

for (const row of history) {
  if (row['Companies Submitted ']) {
    submittedCompanies.add(row['Companies Submitted '].trim());
  }
  if (row['Companies Placed into ']) {
    placedCompanies.add(row['Companies Placed into '].trim());
  }
}

console.log('\n=== Companies in Submissions ===');
console.log([...submittedCompanies].sort().join('\n'));

console.log('\n=== Companies in Placements ===');
console.log([...placedCompanies].sort().join('\n'));

// Find mismatches
console.log('\n=== MISMATCHES (Submitted companies not in Clients) ===');
for (const company of submittedCompanies) {
  if (!clientNames.has(company.toLowerCase())) {
    // Try to find a close match
    const matches = [...clientNames].filter(c =>
      c.includes(company.toLowerCase()) || company.toLowerCase().includes(c)
    );
    console.log(`"${company}" → possible matches: ${matches.length > 0 ? matches.join(', ') : 'NONE'}`);
  }
}
