import assert from 'node:assert/strict';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';
import type { AuthService } from '../auth/auth.service';
import { isClockInTime, normalizeBssid } from './attendance-code';
import { V2AttendanceService } from './v2-attendance.service';

const now = Date.parse('2026-11-09T22:00:00+08:00');
assert.equal(normalizeBssid('AA-BB-CC-DD-EE-FF'), 'aa:bb:cc:dd:ee:ff');
assert.equal(normalizeBssid(' 01:23:45:67:89:AB '), '01:23:45:67:89:ab');

const date = new Date('2026-11-09');
const shift = { startsAt: '22:00', endsAt: '06:00', spansNextDay: true };
assert.equal(isClockInTime(date, shift, 15, now - 901_000), false);
assert.equal(isClockInTime(date, shift, 15, now - 900_000), true);
assert.equal(
  isClockInTime(date, shift, 15, Date.parse('2026-11-10T00:01:00+08:00')),
  true
);
assert.equal(
  isClockInTime(date, shift, 15, Date.parse('2026-11-10T06:00:00+08:00')),
  false
);

async function checkTestAttendance() {
  const login = { employeeId: 'employee', storeId: 'zhonghai', operatorId: 'tester' };
  const assignment = {
    id: 'shift', workDate: date, shift: { ...shift, storeId: login.storeId },
    period: { storeId: login.storeId }, attendancePunches: []
  };
  const audit: Array<{ subject: string; actorId: string }> = [];
  function checkScope(where: Prisma.V2ScheduleAssignmentWhereInput) {
    assert.equal(where.employeeId, login.employeeId);
    assert.deepEqual(where.period, {
      storeId: login.storeId, status: { in: ['PUBLISHED', 'LOCKED'] },
      store: { status: 'OPERATING', deletedAt: null }
    });
  }
  const db = {
    $transaction: (action: (tx: unknown) => unknown) => action(db),
    v2AttendanceSettings: { findUnique: async () => ({ clockInEarly: 15 }) },
    v2ScheduleAssignment: {
      findMany: async ({ where }: { where: Prisma.V2ScheduleAssignmentWhereInput }) => {
        checkScope(where);
        return [assignment];
      },
      findFirst: async ({ where }: { where: Prisma.V2ScheduleAssignmentWhereInput }) => {
        checkScope(where);
        return where.id === assignment.id ? assignment : null;
      }
    },
    v2AttendanceWifiNetwork: {
      findFirst: async ({ where }: { where: { bssid: string; storeId: string } }) => {
        assert.equal(where.storeId, login.storeId);
        return where.bssid === 'aa:bb:cc:dd:ee:ff' ? { id: 'wifi', storeId: login.storeId } : null;
      }
    },
    v2AttendancePunch: { findUnique: async () => null, create: async () => ({ id: 'punch' }) },
    v2AttendanceCorrection: {
      findUnique: async () => null, create: async () => ({ id: 'request' }),
      updateMany: async () => ({ count: 0 })
    },
    v2AuthorizationAudit: { create: async ({ data }: { data: typeof audit[number] }) => { audit.push(data); } }
  };
  const service = new V2AttendanceService(db as unknown as PrismaService, new ConfigService(), {} as AuthService);
  assert.deepEqual(await service.assignments(login), [assignment]);
  const originalNow = Date.now;
  try {
    Date.now = () => now - 901_000;
    await assert.rejects(service.wifiPunch(login, assignment.id, 'AA-BB-CC-DD-EE-FF', 'IN'), /打卡窗口/);
    Date.now = () => now;
    await assert.rejects(service.wifiPunch(login, 'other-store', 'AA-BB-CC-DD-EE-FF', 'IN'), /无权/);
    await assert.rejects(service.wifiPunch(login, assignment.id, '01:02:03:04:05:06', 'IN'), /未在该排班门店登记/);
    assert.deepEqual(await service.wifiPunch(login, assignment.id, 'AA-BB-CC-DD-EE-FF', 'IN'), { id: 'punch' });
    assert.deepEqual(await service.requestCorrection(login, assignment.id, 'OUT', new Date(now).toISOString(), '验收'), { id: 'request' });
  } finally {
    Date.now = originalNow;
  }
  assert.deepEqual(audit.map(({ subject, actorId }) => [subject, actorId]), [
    ['EMPLOYEE_TEST_ATTENDANCE_PUNCH', login.operatorId],
    ['EMPLOYEE_TEST_ATTENDANCE_CORRECTION', login.operatorId]
  ]);
}

void checkTestAttendance().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
