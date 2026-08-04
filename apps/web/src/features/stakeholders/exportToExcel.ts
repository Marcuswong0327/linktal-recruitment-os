import { downloadAsExcel, splitContactDateTime } from '@/lib/excel-export';
import { stakeholderFullName, type Stakeholder } from './schema';

/**
 * Client-side export — the rows are already fetched for the grid, so there's
 * no need for a server round trip. "Contact Name" (the stakeholder) and
 * "Last Contacted By" (the consultant) are kept as separate columns —
 * exported data must never conflate the org user with the external contact.
 */
export function exportStakeholdersToExcel(stakeholders: Stakeholder[]) {
  const rows = stakeholders.map((s) => {
    const { date, time } = splitContactDateTime(s.lastContactedAt);
    return {
      'Contact Name': stakeholderFullName(s),
      Company: s.companyName ?? '',
      'Role type': s.roleType ?? '',
      'Job title': s.jobTitle ?? '',
      Email: s.email ?? '',
      Mobile: s.mobile ?? '',
      'Details accurate': s.isAccurate === null ? 'Unchecked' : s.isAccurate ? 'Yes' : 'No',
      'Last Contacted Date': date,
      'Last Contacted Time': time,
      'Last Contact Method': s.lastContactType ?? '',
      'Last Contacted By': s.lastContactedBy ?? '',
      'Last Contact Notes': s.lastContactNotes ?? '',
    };
  });

  downloadAsExcel(rows, 'stakeholders', 'Stakeholders');
}
