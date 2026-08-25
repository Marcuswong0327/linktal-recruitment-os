// Same ceiling as the .xlsx bulk-import endpoints (MAX_IMPORT_FILE_BYTES in
// ../common/xlsx-import.ts) — these are recruiter-attached documents
// (TOB PDFs, job ads, resumes), not bulk data files, but there's no reason to
// give them a different limit.
export const MAX_UPLOAD_FILE_BYTES = 10 * 1024 * 1024;

// What a recruiter plausibly attaches: office docs, PDFs, images (scanned
// signatures/ads), plain text, and email exports. Deliberately excludes
// executables/archives/scripts — this is object storage behind a public URL,
// not a general file drop.
export const ALLOWED_UPLOAD_MIME_TYPES = new Set<string>([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/rtf',
  'text/plain',
  'text/csv',
  'message/rfc822', // .eml
  'application/vnd.ms-outlook', // .msg
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
