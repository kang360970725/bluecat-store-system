export function scheduleCycleValue<T>(
  cycle: readonly T[],
  dayIndex: number,
  employeeIndex: number,
  employeeCount: number,
  stagger: boolean
) {
  if (!cycle.length) throw new Error('排班循环不能为空');
  const phase = stagger
    ? Math.floor((employeeIndex * cycle.length) / Math.max(1, employeeCount))
    : 0;
  return cycle[(dayIndex + phase) % cycle.length];
}

export function sourceOffsetForTargetDay(dayIndex: number, sourceDays: number) {
  if (sourceDays < 1) throw new Error('源排班周期不能为空');
  return dayIndex % sourceDays;
}
