import * as path from 'node:path';

/**
 * Directory holding the source Excel workbooks used by the import scripts.
 * Defaults to `apps/api/data` (repo-relative). Override for a one-off run with:
 *   DATA_DIR=/some/other/dir pnpm --filter @linktal/api import:excel
 */
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '..', 'data');

/** Absolute path to a workbook by file name, resolved against DATA_DIR. */
export const dataFile = (name: string): string => path.join(DATA_DIR, name);
