export function calculateProfitAchievement(
  target: number,
  actual: number
): number {
  const a =
    target <= 30000
      ? 20000
      : target <= 60000
        ? 30000
        : target <= 100000
          ? 40000
          : 50000;
  const b =
    target <= 30000
      ? 20000
      : target <= 60000
        ? 30000
        : target <= 100000
          ? 20000
          : 30000;
  if (actual >= target) return 1;
  if (actual >= target - a) return clamp(1 + ((actual - target) / a) * 0.4);
  if (actual >= target - a - b)
    return clamp(((a + b) / b) * 0.6 + ((actual - target) / b) * 0.6);
  return 0;
}

export function calculateExcessBonusPool(
  target: number,
  actual: number
): { excessProfit: number; bonusPool: number } {
  const excessProfit = Math.max(actual - target, 0);
  const bonusPool =
    Math.min(excessProfit, 30000) * 0.3 +
    Math.max(excessProfit - 30000, 0) * 0.45;
  return {
    excessProfit: roundMoney(excessProfit),
    bonusPool: roundMoney(bonusPool)
  };
}

export type PayrollCalculationInput = {
  employeeType: 'STORE_STAFF' | 'STORE_MANAGER' | 'HEAD_OFFICE';
  grade?: string;
  category?: '一类' | '二类' | '三类';
  requiredAttendance: number;
  actualAttendance: number;
  kpiScore: number;
  baseSalary?: number;
  performanceBase?: number;
  compensationType?: 'MONTHLY' | 'HOURLY';
  hourlyRate?: number;
  probationary?: boolean;
  fullAttendance?: boolean;
  socialSecuritySubsidy?: number;
  rankAllowance?: number;
  mealAllowanceRate?: number;
  makeupAllowance?: number;
  customScoreAdjustment?: number;
  otherEarnings?: number;
  otherDeductions?: number;
  employeeInsurance?: number;
  employeeProvidentFund?: number;
  employerInsurance?: number;
  employerProvidentFund?: number;
  incomeTax?: number;
  alreadyPaid?: number;
  advancePayment?: number;
  profitRate: number;
  attendanceQualified: boolean;
};

const managerGrades: Record<string, [number, number]> = {
  P0: [2000, 4000],
  P1: [2400, 4600],
  P2: [3000, 5200],
  P3: [3400, 5700],
  P4: [4100, 6750]
};
const headOfficeGrades: Record<string, [number, number, number, number]> = {
  M0: [1400, 1600, 1600, 1600],
  M1: [2500, 3000, 2600, 2300],
  M2: [3000, 4800, 4300, 3800],
  M3: [3500, 6600, 5800, 5000],
  M4: [4000, 8200, 7700, 7000],
  M5: [5000, 10000, 9000, 8000],
  M6: [7000, 12000, 10000, 9000]
};

export function calculatePayroll(input: PayrollCalculationInput) {
  if (input.requiredAttendance <= 0) throw new Error('应出勤必须大于0');
  const rawRatio = input.actualAttendance / input.requiredAttendance;
  const payRatio = Math.min(rawRatio, 1);
  const kpi =
    input.employeeType === 'STORE_STAFF'
      ? input.kpiScore
      : Math.min(input.kpiScore, 100);
  let base = input.baseSalary ?? 0;
  let performanceBase = input.performanceBase ?? 0;
  let performanceScore = kpi;
  if (input.compensationType === 'HOURLY') {
    if (!input.hourlyRate || input.hourlyRate <= 0)
      throw new Error('时薪制员工缺少有效岗位时薪');
    base = input.hourlyRate * input.actualAttendance;
    performanceBase = 0;
  } else if (input.employeeType === 'STORE_MANAGER') {
    const grade = input.grade ? managerGrades[input.grade] : undefined;
    if (!grade) throw new Error('店长必须设置有效P等级');
    const factor =
      input.probationary && !['P0', 'P1'].includes(input.grade!) ? 0.8 : 1;
    [base, performanceBase] = [
      (input.baseSalary ?? grade[0]) * factor,
      (input.performanceBase ?? grade[1]) * factor
    ];
    performanceScore = Math.min(
      150,
      kpi * 0.2 + input.profitRate * 80 + (input.customScoreAdjustment ?? 0)
    );
  } else if (input.employeeType === 'HEAD_OFFICE') {
    const grade = input.grade ? headOfficeGrades[input.grade] : undefined;
    if (!grade || !input.category)
      throw new Error('总部员工必须设置有效M等级和岗位类别');
    const categoryIndex =
      input.category === '一类' ? 1 : input.category === '二类' ? 2 : 3;
    const factor =
      input.probationary && !['M0', 'M1'].includes(input.grade!) ? 0.8 : 1;
    base = grade[0] * factor;
    performanceBase = grade[categoryIndex] * factor;
    const kpiWeight =
      input.category === '一类' ? 20 : input.category === '二类' ? 50 : 80;
    performanceScore = Math.min(
      150,
      (kpi * kpiWeight) / 100 +
        input.profitRate * (100 - kpiWeight) +
        (input.customScoreAdjustment ?? 0)
    );
  }
  const actualBaseSalary = roundMoney(
    input.compensationType === 'HOURLY' ? base : base * payRatio
  );
  const performancePay = roundMoney(
    ((performanceBase * performanceScore) / 100) * payRatio
  );
  const fullAttendanceAllowance =
    input.employeeType === 'STORE_STAFF' && input.fullAttendance
      ? roundMoney(200 * payRatio)
      : 0;
  const socialSecuritySubsidy = roundMoney(
    (input.socialSecuritySubsidy ?? 0) * payRatio
  );
  const rankAllowance = input.attendanceQualified
    ? roundMoney((input.rankAllowance ?? 0) * payRatio)
    : 0;
  const mealAllowance = roundMoney(
    (input.mealAllowanceRate ?? 0) * input.actualAttendance
  );
  const makeupAllowance = roundMoney((input.makeupAllowance ?? 0) * payRatio);
  const grossPay = roundMoney(
    actualBaseSalary +
      performancePay +
      fullAttendanceAllowance +
      socialSecuritySubsidy +
      rankAllowance +
      mealAllowance +
      makeupAllowance +
      (input.otherEarnings ?? 0) -
      (input.otherDeductions ?? 0)
  );
  const employeeDeductions = roundMoney(
    (input.employeeInsurance ?? 0) +
      (input.employeeProvidentFund ?? 0) +
      (input.incomeTax ?? 0) +
      (input.alreadyPaid ?? 0) +
      (input.advancePayment ?? 0)
  );
  const employerContributions = roundMoney(
    (input.employerInsurance ?? 0) + (input.employerProvidentFund ?? 0)
  );
  return {
    actualAttendanceRatio: rawRatio,
    payAttendanceRatio: payRatio,
    kpiScoreApplied: kpi,
    performanceScore,
    actualBaseSalary,
    performancePay,
    fullAttendanceAllowance,
    socialSecuritySubsidy,
    rankAllowance,
    mealAllowance,
    makeupAllowance,
    grossPay,
    employeeDeductions,
    netPay: roundMoney(grossPay - employeeDeductions),
    employerContributions,
    employerCost: roundMoney(grossPay + employerContributions)
  };
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}
function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
