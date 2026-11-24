import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  encodeTaskEvidence,
  maxEncodedEvidenceFileSize,
  maxEncodedEvidenceTotalSize,
  maxEvidenceFiles
} from './task-evidence';
import { checklistItems, normalizeChecklist } from './v2-operational-tasks.service';

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
  console.log('Operational task workflow regression checks passed');
}

void main();
