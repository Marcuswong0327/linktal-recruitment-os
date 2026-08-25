import { ApiProperty } from '@nestjs/swagger';

// No metadata table backs this — the R2 object key is the only record of an
// upload, and it's the caller's job to store it on the owning row
// (Tob.sourceFileLink, JobOrder.jdFileUrl, Candidate.rawResumeUrl, ...). The
// bucket is private: `key` is opaque and only resolves to bytes through
// UploadsController's GET /uploads/view, which re-checks the owning entity's
// read permission on every request — it's not a public URL.
export class UploadResultEntity {
  @ApiProperty({ description: 'Object key — pass to GET /uploads/view?key=... to fetch it back' })
  key!: string;

  @ApiProperty({ description: 'Original filename, as uploaded' })
  fileName!: string;
}
