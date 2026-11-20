import assert from 'node:assert/strict';
import { scheduleCycleValue, sourceOffsetForTargetDay } from './schedule-cycle';

const cycle = ['DAY', 'DAY', 'NIGHT', 'NIGHT', null, null] as const;
const rows = [0, 1, 2].map((employeeIndex) =>
  Array.from({ length: 6 }, (_, dayIndex) =>
    scheduleCycleValue(cycle, dayIndex, employeeIndex, 3, true)
  )
);

assert.deepEqual(rows[0], ['DAY', 'DAY', 'NIGHT', 'NIGHT', null, null]);
assert.deepEqual(rows[1], ['NIGHT', 'NIGHT', null, null, 'DAY', 'DAY']);
assert.deepEqual(rows[2], [null, null, 'DAY', 'DAY', 'NIGHT', 'NIGHT']);

for (let dayIndex = 0; dayIndex < 6; dayIndex++) {
  assert.equal(rows.filter((row) => row[dayIndex] === 'DAY').length, 1);
  assert.equal(rows.filter((row) => row[dayIndex] === 'NIGHT').length, 1);
  assert.equal(rows.filter((row) => row[dayIndex] === null).length, 1);
}

assert.equal(scheduleCycleValue(['CUSTOM'], 30, 0, 1, false), 'CUSTOM');
assert.equal(sourceOffsetForTargetDay(30, 30), 0);
assert.equal(sourceOffsetForTargetDay(30, 31), 30);
assert.throws(() => sourceOffsetForTargetDay(0, 0), /不能为空/);

console.log('Schedule cycle regression checks passed');
