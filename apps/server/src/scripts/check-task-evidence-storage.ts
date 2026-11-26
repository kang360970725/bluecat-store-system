import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';
import { TaskEvidenceObjectStorage } from '../modules/v2-operational-tasks/task-evidence-storage';

config({ path: resolve(process.cwd(), '../../.env'), quiet: true });

async function main() {
  const storage = new TaskEvidenceObjectStorage(new ConfigService());
  const payload = Buffer.from(`bluecat-storage-preflight:${randomUUID()}`);
  let objectKey: string | undefined;
  try {
    const stored = await storage.put(payload);
    objectKey = stored.objectKey;
    const downloaded = await storage.get(objectKey, stored.checksumSha256);
    if (!downloaded.equals(payload)) {
      throw new Error('Task evidence storage content mismatch');
    }
  } finally {
    if (objectKey) await storage.delete(objectKey);
  }
  console.log('Task evidence private storage preflight passed');
}

void main();
