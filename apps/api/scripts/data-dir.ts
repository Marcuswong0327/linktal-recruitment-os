import * as path from 'node:path';

/**
 * Directory holding the source data the import scripts read: the cached
 * workbook (`linktal-workbook.xlsx`, fetched by `./workbook`) and the GeoNames
 * dumps under `geonames/`. Defaults to `apps/api/data` (repo-relative).
 *
 * Override for a one-off run with:
 *   DATA_DIR=/some/other/dir pnpm --filter @linktal/api import:workbook
 */
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '..', 'data');
