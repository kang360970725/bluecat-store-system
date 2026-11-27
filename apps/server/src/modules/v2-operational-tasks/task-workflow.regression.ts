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
  normalizeChecklist,
  V2OperationalTasksService
} from './v2-operational-tasks.service';
import { TaskEvidenceObjectStorage } from './task-evidence-storage';
import type { PrismaService } from '../../database/prisma.service';

async function checkPublishing() {
  const ordinaryAccount = {
    status: 'ACTIVE',
    usesAccountRoles: true,
    employeeId: null,
    roles: [],
    storeScopes: []
  };
  const taskWrites: unknown[] = [];
  const templateWrites: unknown[] = [];
  const db = {
    $transaction: (action: (tx: unknown) => unknown) => action(db),
    v2Account: { findFirst: async () => ordinaryAccount },
    v2Employment: {
      findMany: async () => [
        { store: { id: 'store-1', name: '一店' }, position: { id: 'cashier', name: '收银' } }
      ]
    },
    v2OrganizationEmployment: { findMany: async () => [] },
    v2OperationalTaskExecutorGroup: { findMany: async () => [] },
    v2OperationalTask: {
      findMany: async () => [],
      createMany: async ({ data }: { data: unknown[] }) => taskWrites.push(...data),
      create: async ({ data }: { data: unknown }) => taskWrites.push(data)
    },
    v2OperationalTaskSchedule: {
      findMany: async () => [],
      findFirst: async () => templateWrites[0],
      createMany: async ({ data }: { data: unknown[] }) => templateWrites.push(...data),
      updateMany: async () => ({ count: 1 })
    }
  };
  const config = new ConfigService();
  const service = new V2OperationalTasksService(
    db as unknown as PrismaService, config, new TaskEvidenceObjectStorage(config)
  );
  const targets = await service.dispatchTargets('ordinary-account');
  assert.equal(targets[0]?.targetKey, 'store:cashier');
  const input = {
    title: '卫生自查',
    description: '检查吧台',
    category: '门店自查',
    targets: [{ storeId: 'store-1', targetKey: 'store:cashier' }]
  };
  const future = new Date(Date.now() + 3_600_000).toISOString();
  assert.deepEqual(await service.dispatch('ordinary-account', {
    ...input, batchId: 'single', dueAt: future
  }), { count: 1 });
  await assert.rejects(service.dispatch('ordinary-account', {
    ...input, batchId: 'rectification', sourceTaskId: 'original', dueAt: future
  }), /缺少运营任务权限/);
  assert.deepEqual(await service.createSchedule('ordinary-account', {
    ...input, requestId: 'recurring', cadence: 'DAILY', firstRunAt: future, dueHours: 2
  }), { count: 1 });
  Object.assign(templateWrites[0] as object, { nextRunAt: new Date(Date.now() - 1000) });
  await (service as unknown as { runSchedule(id: string): Promise<void> }).runSchedule('recurring:0');
  assert.equal(taskWrites.length, 2);
  assert.deepEqual(taskWrites.map((task) => (task as { category: string }).category),
    ['门店自查', '门店自查']);
}

async function main() {
  await checkPublishing();
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
