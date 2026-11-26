import type { V2OperationalTaskStatus } from '@prisma/client';

export interface TaskReportQuery {
  from: string;
  to: string;
  storeId?: string;
  kind?: 'TASK' | 'RECTIFICATION';
}

export interface TaskCounts {
  total: number;
  pending: number;
  claimed: number;
  submitted: number;
  done: number;
  overdue: number;
}

export const emptyTaskCounts = (): TaskCounts => ({
  total: 0,
  pending: 0,
  claimed: 0,
  submitted: 0,
  done: 0,
  overdue: 0
});

export function taskStatusLabel(
  status: V2OperationalTaskStatus,
  dueAt: Date,
  now: Date
) {
  if ((status === 'PENDING' || status === 'CLAIMED') && dueAt <= now)
    return '已逾期';
  return {
    PENDING: '待认领',
    CLAIMED: '执行中',
    SUBMITTED: '待确认',
    DONE: '已完成'
  }[status];
}
