import assert from 'node:assert/strict';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import {
  encodeTaskEvidence,
  maxEncodedEvidenceFileSize,
  maxEncodedEvidenceTotalSize,
  maxEvidenceFiles
} from './task-evidence';
import {
  checklistItems,
  normalizeChecklist
} from './v2-operational-tasks.service';
import { TaskEvidenceObjectStorage } from './task-evidence-storage';

async function main() {
  const legacy = normalizeChecklist(['门口整洁', '吧台无私人物品']);
  assert.deepEqual(legacy, [
    { id: '0', label: '门口整洁', mode: 'CONFIRM' },
    { id: '1', label: '吧台无私人物品', mode: 'CONFIRM' }
  ]);

  const structured = normalizeChecklist([
    { id: 'entrance', label: '门口整洁', mode: 'PHOTO_REQUIRED' },
    { id: 'counter', label: '吧台整洁', mode: 'CONFIRM' }
  ]);
  assert.equal(checklistItems(structured)[0]?.mode, 'PHOTO_REQUIRED');
  assert.throws(() =>
    normalizeChecklist([
      { id: 'a', label: '重复', mode: 'CONFIRM' },
      { id: 'b', label: '重复', mode: 'PHOTO_REQUIRED' }
    ])
  );
  assert.throws(() =>
    normalizeChecklist(
      Array.from({ length: 13 }, (_, index) => ({
        id: `photo_${index}`,
        label: `拍照项 ${index}`,
        mode: 'PHOTO_REQUIRED'
      }))
    )
  );

  const source = await sharp({
    create: {
      width: 2400,
      height: 1800,
      channels: 3,
      background: '#6f8fb8'
    }
  })
    .png()
    .toBuffer();
  const encoded = await encodeTaskEvidence(source);
  assert.ok(encoded.byteSize <= maxEncodedEvidenceFileSize);
  assert.ok(encoded.width <= 1440 && encoded.height <= 1440);
  assert.equal(maxEvidenceFiles, 12);
  assert.equal(maxEncodedEvidenceTotalSize, 9 * 1024 * 1024);

  let storedBody: Uint8Array<ArrayBufferLike> = new Uint8Array();
  const storage = new TaskEvidenceObjectStorage(new ConfigService());
  Object.assign(storage, {
    bucket: 'private-test',
    client: {
      send: async (command: {
        constructor: { name: string };
        input: { Body?: Uint8Array<ArrayBufferLike> };
      }) => {
        if (command.constructor.name === 'PutObjectCommand') {
          storedBody = command.input.Body ?? new Uint8Array();
          return { ETag: '"test-etag"' };
        }
        if (command.constructor.name === 'GetObjectCommand') {
          return { Body: { transformToByteArray: async () => storedBody } };
        }
        return {};
      }
    }
  });
  const uploaded = await storage.put(encoded.image);
  assert.match(uploaded.objectKey, /^task-evidence\/\d{4}\/\d{2}\/.+\.jpg$/);
  assert.equal(uploaded.etag, 'test-etag');
  assert.equal(uploaded.checksumSha256.length, 64);
  assert.deepEqual(
    await storage.get(uploaded.objectKey, uploaded.checksumSha256),
    Buffer.from(encoded.image)
  );
  await assert.rejects(() => storage.get(uploaded.objectKey, '0'.repeat(64)));
  await storage.delete(uploaded.objectKey);
  console.log('Operational task workflow regression checks passed');
}

void main();
