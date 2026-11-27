import assert from 'node:assert/strict';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
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
import { V2AttendanceService } from '../v2-attendance/v2-attendance.service';
import type { AuthService } from '../auth/auth.service';
import { V2OperationalTasksController } from './v2-operational-tasks.controller';

async function checkPublishing(reference: Buffer) {
  const ordinaryAccount = {
    status: 'ACTIVE',
    usesAccountRoles: true,
    employeeId: null,
    roles: [],
    storeScopes: []
  };
  const taskWrites: unknown[] = [];
  const notificationWrites: unknown[] = [];
  const templateWrites: unknown[] = [];
  const db = {
    $transaction: (action: (tx: unknown) => unknown) => action(db),
    v2Account: {
      findFirst: async () => ordinaryAccount,
      findMany: async () => [{ id: 'receiver' }]
    },
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
      create: async ({ data }: { data: object }) => {
        const task = { ...data, id: 'scheduled-task' };
        taskWrites.push(task);
        return task;
      }
    },
    v2OperationalTaskNotification: {
      createMany: async ({ data }: { data: unknown[] }) => notificationWrites.push(...data)
    },
    v2OperationalTaskSchedule: {
      findMany: async () => [],
      findFirst: async () => templateWrites[0],
      createMany: async ({ data }: { data: unknown[] }) => templateWrites.push(...data),
      updateMany: async () => ({ count: 1 })
    }
  };
  const config = new ConfigService();
  const storage = new TaskEvidenceObjectStorage(config);
  storage.put = async () => ({
    objectKey: 'references/photo.jpg', checksumSha256: 'image-checksum', etag: null
  });
  const service = new V2OperationalTasksService(
    db as unknown as PrismaService, config, storage,
    {} as V2AttendanceService
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
  assert.deepEqual(notificationWrites, taskWrites.map((task) => ({
    taskId: (task as { id: string }).id, recipientId: 'receiver', kind: 'ASSIGNED'
  })));
  assert.deepEqual(taskWrites.map((task) => (task as { category: string }).category),
    ['门店自查', '门店自查']);

  const [, dto] = Reflect.getMetadata(
    'design:paramtypes', V2OperationalTasksController.prototype, 'dispatchWithReferences'
  ) as Array<new () => object>;
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const payload = { ...input, batchId: '127c8c63-6df7-4fe2-8717-c1a0c07e3749', dueAt: future };
  const result = await pipe.transform(
    { payload: JSON.stringify(payload) }, { type: 'body', metatype: dto }
  );
  assert.equal(result.payload.title, input.title);
  await assert.rejects(pipe.transform(
    { payload: JSON.stringify({ ...payload, targets: [] }) }, { type: 'body', metatype: dto }
  ));
  assert.deepEqual(await service.dispatchWithReferences('ordinary-account', payload, [reference]),
    { count: 1 });
  const { id: attachedTaskId, ...attachedTask } = taskWrites.at(-1) as { id: string };
  assert.ok(attachedTaskId);
  assert.deepEqual(attachedTask, {
    storeId: 'store-1', targetKey: 'store:cashier', targetName: '收银',
    sourceTaskId: null, sourceIssue: undefined, title: input.title, category: input.category,
    referenceImages: [{ objectKey: 'references/photo.jpg', checksumSha256: 'image-checksum' }],
    referenceImageCount: 1, wechatPending: false, description: input.description,
    checklist: [], reviewMode: 'REQUIRED', ccRecipients: [], dueAt: new Date(future),
    batchId: payload.batchId, createdBy: 'ordinary-account'
  });
}

async function checkWechatMessage() {
  const settings = {
    jwt: { secret: 'synthetic-test-encryption-key' },
    ATTENDANCE_WECHAT_APP_ID: 'wx-synthetic',
    ATTENDANCE_WECHAT_APP_SECRET: 'synthetic-app-secret',
    TASK_WECHAT_TEMPLATE_ID: 'synthetic-template',
    TASK_WECHAT_TITLE_FIELD: 'thing1',
    TASK_WECHAT_TIME_FIELD: 'time2',
    TASK_WECHAT_MINIPROGRAM_STATE: 'trial'
  };
  let openIdCipher = '';
  const db = {
    v2AttendanceSettings: { findUnique: async () => null },
    v2AttendanceWechatBinding: {
      updateMany: async ({ data }: { data: { taskOpenIdCipher: string } }) => {
        openIdCipher = data.taskOpenIdCipher;
        return { count: 1 };
      }
    }
  };
  const service = new V2AttendanceService(
    db as unknown as PrismaService, new ConfigService(settings), {} as AuthService
  );
  const originalFetch = globalThis.fetch;
  const calls: unknown[] = [];
  globalThis.fetch = async (url, options) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/jscode2session')) return Response.json({ openid: 'synthetic-open-id' });
    if (path.endsWith('/stable_token')) return Response.json({ access_token: 'test-token', expires_in: 7200 });
    assert.equal(path, '/cgi-bin/message/subscribe/send');
    calls.push(JSON.parse(String(options?.body)));
    return Response.json({ errcode: 0 });
  };
  try {
    const template = await service.taskWechatTemplate();
    assert.ok(template);
    await service.subscribeToTask('employee', 'synthetic-code', template.templateId);
    assert.ok(openIdCipher);
    assert.notEqual(openIdCipher, 'synthetic-open-id');
    const token = await service.taskWechatAccessToken(template.appid);
    await service.sendTaskWechatMessage(token, openIdCipher, template, {
      id: 'task-id', title: '门店自查', dueAt: new Date('2026-11-27T10:00:00Z')
    });
    assert.deepEqual(calls, [{
      touser: 'synthetic-open-id', template_id: 'synthetic-template',
      page: 'tasks/index/index?taskId=task-id', miniprogram_state: 'trial', lang: 'zh_CN',
      data: { thing1: { value: '门店自查' }, time2: { value: '2026-11-27 18:00' } }
    }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function main() {
  await checkWechatMessage();
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
  await checkPublishing(source);
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
