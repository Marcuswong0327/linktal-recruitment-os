/**
 * Restores one day's backup (produced by backup-db.ts) from R2 into
 * RESTORE_TARGET_URL — deliberately never the live prod DB. Point this at a
 * scratch Neon branch/database you provision yourself first; this script
 * only does the mechanical download + pg_restore, never touches Railway's
 * env vars or repoints production traffic. See docs/migrations.md §8 for
 * the full runbook (including the manual cutover step this intentionally
 * stops short of).
 *
 *   pnpm --filter @linktal/api restore:db -- --date=2026-08-01
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function parseDateArg(): string {
  const arg = process.argv.find((a) => a.startsWith('--date='));
  const date = arg?.slice('--date='.length);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Usage: restore-db.ts --date=YYYY-MM-DD (matches a backups/<date>.dump object in R2)');
  }
  return date;
}

async function main() {
  const date = parseDateArg();
  const accountId = requireEnv('R2_ACCOUNT_ID');
  const accessKeyId = requireEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');
  const bucket = requireEnv('R2_BUCKET');
  const targetUrl = requireEnv('RESTORE_TARGET_URL');

  const objectKey = `backups/${date}.dump`;
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });

  const tmpDir = await mkdtemp(join(tmpdir(), 'db-restore-'));
  const localPath = join(tmpDir, 'restore.dump');

  try {
    console.log(`Downloading ${bucket}/${objectKey}...`);
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
    if (!obj.Body) throw new Error(`No such backup: ${objectKey}`);
    await pipeline(obj.Body as NodeJS.ReadableStream, createWriteStream(localPath));

    console.log(`Restoring into RESTORE_TARGET_URL (never the live prod DB — verify this points at a scratch DB)...`);
    // --clean --if-exists: safe to re-run into the same scratch DB.
    // --no-owner/--no-privileges: mirrors backup-db.ts's dump flags.
    const args = ['--clean', '--if-exists', '--no-owner', '--no-privileges', '-j', '4', '-d', targetUrl, localPath];
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn('pg_restore', args, { stdio: 'inherit' });
      child.on('error', reject);
      child.on('close', (code) => resolve(code ?? 1));
    });

    // pg_restore commonly exits 1 on harmless warnings (e.g. "role does not
    // exist" for a grant it couldn't strip) — only treat a hard failure
    // (>1, or no data restored) as fatal. Inspect the job log either way.
    if (exitCode > 1) {
      throw new Error(`pg_restore exited with code ${exitCode}`);
    }

    console.log(`Restore finished (exit code ${exitCode}). Verify row counts before treating this as good.`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
