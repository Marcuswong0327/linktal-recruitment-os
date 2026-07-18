import { downloadAsExcel, splitContactDateTime } from '@/lib/excel-export';
import { candidateStatusLabels } from './schema';
import type { Candidate } from './schema';

/**
 * Client-side export — the rows are already fetched for the grid, so there's
 * no need for a server round trip. "Candidate Name" and "Last Contacted By"
 * (the consultant) are kept as separate columns — exported data must never
 * conflate the org user with the external candidate.
 */
export function exportCandidatesToExcel(
  candidates: Candidate[],
  consultantLabelFor: (consultantId: string) => string,
) {
  const rows = candidates.map((c) => {
    const { date, time } = splitContactDateTime(c.lastContactedAt);
    return {
      'Candidate Name': c.fullName,
      Email: c.email ?? '',
      Mobile: c.mobile ?? '',
      'Current Position': c.currentPosition ?? '',
      'Current Company': c.currentCompany ?? '',
      Location: [c.city, c.country].filter(Boolean).join(', '),
      Status: candidateStatusLabels[c.status],
      'Owning Consultant': consultantLabelFor(c.consultantId ?? ''),
      'Last Contacted Date': date,
      'Last Contacted Time': time,
      'Last Contact Method': c.lastContactType ?? '',
      'Last Contacted By': c.lastContactedBy ?? '',
      'Last Contact Notes': c.lastContactNotes ?? '',
    };
  });

  downloadAsExcel(rows, 'candidates', 'Candidates');
}
