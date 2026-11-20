import type { V2OperationalTaskCadence } from '@prisma/client';

const chinaOffset = 8 * 60 * 60 * 1000;
const day = 24 * 60 * 60 * 1000;

export function nextTaskRun(
  cadence: V2OperationalTaskCadence,
  firstRunAt: Date,
  currentRunAt: Date
) {
  if (cadence === 'DAILY' || cadence === 'WEEKLY') {
    return new Date(
      currentRunAt.getTime() + (cadence === 'DAILY' ? day : 7 * day)
    );
  }
  const anchorDay = new Date(firstRunAt.getTime() + chinaOffset).getUTCDate();
  const next = new Date(currentRunAt.getTime() + chinaOffset);
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)
  ).getUTCDate();
  next.setUTCDate(Math.min(anchorDay, lastDay));
  return new Date(next.getTime() - chinaOffset);
}
