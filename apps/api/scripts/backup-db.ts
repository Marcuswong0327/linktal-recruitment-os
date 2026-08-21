/**
 * Nightly production DB backup — streams a `pg_dump -Fc` straight into R2,
 * no local file ever touches disk (the runner's disk footprint stays
 * near-zero regardless of DB size). 30-day retention is enforced by an R2
 * bucket lifecycle rule (configured in the Cloudflare dashboard, not here) —
 * every day snapshots unconditionally, no change-detection: a same-content
 * dump costs pennies in compressed storage, while a false "nothing changed"
 * skip risks losing the one day someone actually needed. See
 * docs/migrations.md §8 for the full runbook.
 *
 *   pnpm --filter @linktal/api backup:db
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function main() {
  const directUrl = requireEnv('DIRECT_URL');
  const accountId = requireEnv('R2_ACCOUNT_ID');
  const accessKeyId = requireEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');
  const bucket = requireEnv('R2_BUCKET');

  const dateKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC
  const objectKey = `backups/${dateKey}.dump`;

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });

  console.log(`Starting pg_dump -> R2 (${bucket}/${objectKey})...`);

  // --no-owner/--no-privileges: the restore target (a fresh Neon branch/DB,
  // possibly in a different project) won't share the source's exact role
  // definitions — stripping ownership/grants keeps the dump portable.
  const args = ['-Fc', '--no-owner', '--no-privileges', '-d', directUrl];
  const child = spawn('pg_dump', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  let bytes = 0;
  const counted = new PassThrough();
  child.stdout.pipe(counted);
  counted.on('data', (chunk: Buffer) => {
    bytes += chunk.length;
  });

  let stderr = '';
  child.stderr.on('data', (d: Buffer) => {
    stderr += d.toString();
  });

  const upload = new Upload({
    client: s3,
    params: { Bucket: bucket, Key: objectKey, Body: counted },
  });

  const [, exitCode] = await Promise.all([
    upload.done(),
    new Promise<number>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => resolve(code ?? 1));
    }),
  ]);

  if (exitCode !== 0) {
    throw new Error(`pg_dump exited with code ${exitCode}:\n${stderr}`);
  }

  console.log(`Uploaded ${(bytes / 1024 / 1024).toFixed(1)} MB to ${bucket}/${objectKey}`);

  // A tiny marker a future staleness check can read ("is the last successful
  // backup older than ~36h?") without listing/parsing the whole bucket.
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: 'backups/_last-success',
      Body: new Date().toISOString(),
    }),
  );

  console.log('Backup complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
