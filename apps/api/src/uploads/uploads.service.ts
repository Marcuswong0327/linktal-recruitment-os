import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

export type UploadFolder = 'tob' | 'job-orders' | 'candidates';

// Matches exactly what buildKey produces: <folder>/<uuid>-<sanitized name>.
// Enforced on every read so a manipulated `key` query param can't reach
// anything else in the bucket — this bucket (R2_BUCKET_NAME) isn't
// dedicated to this app, so that boundary matters.
const KEY_PATTERN =
  /^(tob|job-orders|candidates)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-zA-Z0-9._-]+$/;

/**
 * Thin wrapper around Cloudflare R2 (S3-compatible). Files are proxied
 * through this API rather than uploaded directly from the browser via a
 * presigned URL — matches how the existing .xlsx bulk-import endpoints
 * already take files (multer memory storage), and keeps the R2 secret key
 * server-side only, never handed to the browser.
 *
 * The bucket stays private: nothing is served from a public R2 URL. Reads go
 * back through this API too (UploadsController's GET /uploads/view), gated
 * by the same read permission as the owning entity, and objects are streamed
 * to the client rather than redirected to R2 directly.
 *
 * Lazily builds the S3Client (not in the constructor) so the rest of the app
 * boots fine even before R2 is configured — only an actual upload/view
 * attempt fails until the env vars are filled in.
 */
@Injectable()
export class UploadsService {
  private client?: S3Client;
  private bucket?: string;

  constructor(private readonly config: ConfigService) {}

  private getClient(): { client: S3Client; bucket: string } {
    if (!this.client || !this.bucket) {
      const accountId = this.config.get<string>('R2_ACCOUNT_ID');
      const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
      const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
      const bucket = this.config.get<string>('R2_BUCKET_NAME');

      if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
        throw new InternalServerErrorException({
          code: 'UPLOADS_NOT_CONFIGURED',
          message: 'File uploads are not configured (missing R2 environment variables).',
        });
      }

      // No forcePathStyle: R2 resolves the bucket via virtual-hosted-style
      // (<bucket>.<account>.r2.cloudflarestorage.com) against the account
      // endpoint, per Cloudflare's own S3-compatibility docs.
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });
      this.bucket = bucket;
    }
    return { client: this.client, bucket: this.bucket };
  }

  // The original filename is embedded (sanitized) in the key, prefixed with a
  // UUID for uniqueness — the only way the frontend can recover a display
  // name for the file after a page reload, since nothing else records it.
  private buildKey(folder: UploadFolder, originalName: string): string {
    const sanitized = originalName
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .slice(-150); // keep the tail (extension survives truncation)
    return `${folder}/${randomUUID()}-${sanitized}`;
  }

  async upload(
    folder: UploadFolder,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ): Promise<{ key: string; fileName: string }> {
    const { client, bucket } = this.getClient();
    const key = this.buildKey(folder, file.originalname);

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return { key, fileName: file.originalname };
  }

  /** Which entity-read permission gates viewing `key` — throws if `key` isn't a well-formed key this service issued. */
  resourceForKey(key: string): 'tob' | 'job_order' | 'candidate' {
    if (!KEY_PATTERN.test(key)) {
      throw new BadRequestException({ code: 'INVALID_KEY', message: 'Not a valid upload key.' });
    }
    const folder = key.split('/')[0] as UploadFolder;
    return folder === 'job-orders' ? 'job_order' : folder === 'candidates' ? 'candidate' : 'tob';
  }

  async get(key: string): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
    const { client, bucket } = this.getClient();
    try {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const bytes = await response.Body?.transformToByteArray();
      if (!bytes) throw new NotFoundException({ code: 'NOT_FOUND', message: 'File not found.' });
      return {
        buffer: Buffer.from(bytes),
        contentType: response.ContentType ?? 'application/octet-stream',
        fileName: key.replace(/^[a-z-]+\/[0-9a-f-]{36}-/, ''),
      };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'File not found.' });
    }
  }
}
