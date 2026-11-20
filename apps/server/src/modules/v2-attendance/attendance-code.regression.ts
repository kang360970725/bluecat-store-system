import assert from 'node:assert/strict';
import { isClockInTime, normalizeBssid } from './attendance-code';

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
