export type UsageStrategyAdvice = {
  code: string;
  title: string;
  evidence: string;
  action: string;
};

export type UsageStrategyInput = {
  seatRate: number;
  repeatRate: number;
  averageStayHours: number;
  feePerVisitor: number;
  peakHour: number | null;
  lowWindow: string | null;
  topAreaShare: number;
};

export type UsageStrategyBenchmark = Pick<
  UsageStrategyInput,
  'seatRate' | 'repeatRate' | 'averageStayHours' | 'feePerVisitor'
>;

export function buildUsageStrategies(
  item: UsageStrategyInput,
  benchmark: UsageStrategyBenchmark,
  bottomStore: boolean
): UsageStrategyAdvice[] {
  const advice: UsageStrategyAdvice[] = [];
  if (bottomStore || item.seatRate < benchmark.seatRate * 0.85) {
    advice.push({
      code: 'OFF_PEAK_ACQUISITION',
      title: '低谷时段定向引流',
      evidence: `上座率 ${item.seatRate.toFixed(2)}%，低于门店中位数 ${benchmark.seatRate.toFixed(2)}%${item.lowWindow ? `；最低客流窗口为 ${item.lowWindow}` : ''}`,
      action:
        '优先在低谷窗口测试学生场、早场或组队套餐；高峰时段不做同等折扣，并使用同星期、同时段数据复盘。'
    });
  }
  if (item.repeatRate < benchmark.repeatRate * 0.9) {
    advice.push({
      code: 'RETURN_VISIT',
      title: '提升周期内复访',
      evidence: `复访率 ${item.repeatRate.toFixed(2)}%，低于门店中位数 ${benchmark.repeatRate.toFixed(2)}%`,
      action:
        '在离店后发放限定低谷时段使用的二次到店权益，重点观察7天内再次到店人数，而不是只看发券数量。'
    });
  }
  if (item.averageStayHours < benchmark.averageStayHours * 0.9) {
    advice.push({
      code: 'EXTEND_STAY',
      title: '延长客户停留',
      evidence: `平均停留 ${item.averageStayHours.toFixed(2)} 小时，低于门店中位数 ${benchmark.averageStayHours.toFixed(2)} 小时`,
      action:
        '在客户常见离店前一小时测试续时升级、包时补差或餐饮组合，比较活动前后的平均停留时长。'
    });
  }
  if (item.topAreaShare >= 35) {
    advice.push({
      code: 'AREA_PREFERENCE',
      title: '分散区域偏好',
      evidence: `最高使用区域承载 ${item.topAreaShare.toFixed(2)}% 的上机时长`,
      action:
        '对低偏好区域测试区域专属组队活动或套餐，同时检查客户选择是否由配置、环境或价格差异造成。'
    });
  }
  if (!advice.length && item.peakHour !== null) {
    advice.push({
      code: 'PEAK_CONVERSION',
      title: '高峰客流转化',
      evidence: `主要客流高峰在 ${String(item.peakHour).padStart(2, '0')}:00`,
      action:
        '高峰不再追加普遍折扣，重点做饮品餐食加购、会员沉淀和次日低谷时段回流。'
    });
  }
  return advice.slice(0, 3);
}
