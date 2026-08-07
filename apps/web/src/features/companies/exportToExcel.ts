import { downloadAsExcel } from '@/lib/excel-export';
import { clientQualityLabels, clientStatusLabels, formatDate, type Company } from './schema';

/** Client-side export — the rows are already fetched for the grid, so there's no separate export request. */
export function exportCompaniesToExcel(companies: Company[]) {
  const rows = companies.map((c) => ({
    'Company Name': c.companyName,
    'Display ID': c.displayId,
    Industry: c.industry ?? '',
    Specialization: c.specialization ?? '',
    Market: c.locations.join(', '),
    Status: clientStatusLabels[c.status],
    Quality: clientQualityLabels[c.quality],
    Website: c.website ?? '',
    'Last Contacted': formatDate(c.lastContactedAt),
    'Last Contacted By': c.lastContactedBy ?? '',
    'Last Contact Type': c.lastContactType ?? '',
    'Last Contact Notes': c.lastContactNotes ?? '',
  }));
  downloadAsExcel(rows, 'companies', 'Companies');
}
