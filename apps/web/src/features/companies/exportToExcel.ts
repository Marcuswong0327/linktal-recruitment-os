import { downloadAsExcel, splitContactDateTime } from '@/lib/excel-export';
import { clientStatusLabels, clientQualityLabels } from './schema';
import type { Company } from './schema';

/**
 * Client-side export — the rows are already fetched for the grid, so there's
 * no need for a server round trip. "Company Name" and "Last Contacted By"
 * (the consultant) are kept as separate columns — exported data must never
 * conflate the org user with the external company/stakeholder. "Last
 * Contact*" here reflects whichever of the company's stakeholders was
 * contacted most recently (see ClientsService.findAll's toEntity).
 */
export function exportCompaniesToExcel(companies: Company[], consultantLabelFor: (consultantId: string) => string) {
  const rows = companies.map((c) => {
    const { date, time } = splitContactDateTime(c.lastContactedAt);
    return {
      'Company Name': c.companyName,
      Industry: c.industry ?? '',
      Specialization: c.specialization ?? '',
      Location: [c.city, c.country].filter(Boolean).join(', '),
      Website: c.website ?? '',
      Relationship: clientStatusLabels[c.status],
      Quality: clientQualityLabels[c.quality],
      'TOB Signed': c.tobSigned ? 'Yes' : 'No',
      'Fee %': c.feePercentage ?? '',
      'Owning Consultant': consultantLabelFor(c.consultantId ?? ''),
      'Last Contacted Date': date,
      'Last Contacted Time': time,
      'Last Contact Method': c.lastContactType ?? '',
      'Last Contacted By': c.lastContactedBy ?? '',
      'Last Contact Notes': c.lastContactNotes ?? '',
    };
  });

  downloadAsExcel(rows, 'companies', 'Companies');
}
