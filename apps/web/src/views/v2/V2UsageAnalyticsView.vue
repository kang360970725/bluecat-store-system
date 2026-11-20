<template>
  <div class="page-stack">
    <div class="section-head">
      <div>
        <h1>客流运营分析</h1>
        <p>
          从到店、停留、复访和时段客流中识别运营机会；所有客户数据仅做匿名聚合。
        </p>
      </div>
      <n-space>
        <n-select
          v-model:value="storeId"
          :options="storeOptions"
          :loading="storesLoading"
          class="store-select"
          placeholder="选择门店"
        />
        <n-date-picker
          v-model:formatted-value="dateRange"
          type="daterange"
          value-format="yyyy-MM-dd"
          :clearable="false"
        />
        <n-button type="primary" :loading="loading" @click="loadDashboard(true)"
          >查询</n-button
        >
      </n-space>
    </div>

    <n-alert v-if="error" type="error" :bordered="false">{{ error }}</n-alert>
    <n-alert v-if="rankingError" type="warning" :bordered="false">{{
      rankingError
    }}</n-alert>
    <n-alert v-if="analytics" type="info" :bordered="false">
      数据覆盖 {{ analytics.coverageDays.length }}/{{
        analytics.expectedDays
      }}
      天；客户匿名标识覆盖
      {{
        percent(analytics.traffic.customerIdentificationRate)
      }}。上座率按实际占用机器小时 ÷
      可用机器小时计算，容量取机器快照与周期实际出现机器号的并集，暂不扣除维修和停用时段。
    </n-alert>
    <n-alert
      v-if="analytics?.quality.unmappedObservedMachineCount"
      type="warning"
      :bordered="false"
    >
      本周期发现
      {{
        analytics.quality.unmappedObservedMachineCount
      }}
      台机器未出现在最新机器快照中，系统已纳入上座率分母，但建议重新同步机器区域清单。
    </n-alert>

    <n-spin :show="loading || storesLoading">
      <n-empty v-if="!storeId" description="请选择门店" />
      <template v-else-if="analytics">
        <div class="summary-grid">
          <n-card size="small"
            ><n-statistic
              label="到店人次"
              :value="analytics.traffic.sessionStarts"
          /></n-card>
          <n-card size="small"
            ><n-statistic
              label="去重客数"
              :value="analytics.traffic.uniqueVisitors"
          /></n-card>
          <n-card size="small"
            ><n-statistic
              label="门店上座率"
              :value="analytics.capacity.seatRate ?? 0"
              suffix="%"
          /></n-card>
          <n-card size="small"
            ><n-statistic
              label="峰值同时在线"
              :value="analytics.traffic.peakConcurrent"
              suffix="人"
          /></n-card>
          <n-card size="small"
            ><n-statistic
              label="平均停留"
              :value="analytics.traffic.averageStayHours"
              suffix="小时"
          /></n-card>
          <n-card size="small"
            ><n-statistic
              label="周期内复访率"
              :value="analytics.customerSegments.repeatRate ?? 0"
              suffix="%"
          /></n-card>
        </div>

        <n-tabs v-model:value="viewTab" type="line" animated>
          <n-tab-pane name="traffic" tab="客流运营">
            <div class="tab-stack">
              <n-card size="small" title="系统运营建议">
                <div v-if="selectedStrategies.length" class="advice-grid">
                  <article
                    v-for="item in selectedStrategies"
                    :key="item.code"
                    class="advice-card"
                  >
                    <h3>{{ item.title }}</h3>
                    <p class="evidence">{{ item.evidence }}</p>
                    <p>{{ item.action }}</p>
                  </article>
                </div>
                <n-empty
                  v-else
                  description="当前门店指标接近整体中位水平，建议优先执行高峰加购和次日低谷回流"
                />
              </n-card>

              <n-card size="small" title="星期 × 小时客流热力图">
                <div class="chart-toolbar">
                  <span>颜色越深代表该星期、该小时的日均值越高</span>
                  <n-select
                    v-model:value="heatMetric"
                    :options="heatMetricOptions"
                    class="metric-select"
                  />
                </div>
                <div class="heatmap-wrap">
                  <div class="heatmap-grid">
                    <div class="heat-corner">星期</div>
                    <div
                      v-for="hour in 24"
                      :key="`head-${hour}`"
                      class="heat-head"
                    >
                      {{ String(hour - 1).padStart(2, '0') }}
                    </div>
                    <template v-for="weekday in 7" :key="weekday">
                      <div class="heat-weekday">
                        {{ weekdayLabel(weekday) }}
                      </div>
                      <div
                        v-for="item in heatmapRow(weekday)"
                        :key="`${weekday}-${item.hour}`"
                        class="heat-cell"
                        :style="heatStyle(item)"
                        :title="heatTooltip(item)"
                      >
                        {{ heatText(item) }}
                      </div>
                    </template>
                  </div>
                </div>
              </n-card>

              <n-card size="small" title="到店、离店与同时在线曲线">
                <div class="traffic-legend">
                  <span><i class="arrivals" />日均到店</span
                  ><span><i class="departures" />日均离店</span
                  ><span><i class="concurrent" />平均同时在线</span>
                </div>
                <svg
                  :viewBox="`0 0 ${trafficChartWidth} ${trafficChartHeight}`"
                  class="traffic-chart"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label="到店离店与同时在线曲线"
                >
                  <line
                    v-for="tick in 5"
                    :key="tick"
                    x1="36"
                    :x2="trafficChartWidth - 12"
                    :y1="trafficY(((tick - 1) * trafficMax) / 4)"
                    :y2="trafficY(((tick - 1) * trafficMax) / 4)"
                    class="grid-line"
                  />
                  <polyline
                    :points="trafficPoints('averageSessionStarts')"
                    fill="none"
                    stroke="#2563eb"
                    stroke-width="2.5"
                    vector-effect="non-scaling-stroke"
                  />
                  <polyline
                    :points="trafficPoints('averageSessionEnds')"
                    fill="none"
                    stroke="#ea580c"
                    stroke-width="2.5"
                    vector-effect="non-scaling-stroke"
                  />
                  <polyline
                    :points="trafficPoints('averageConcurrent')"
                    fill="none"
                    stroke="#16a34a"
                    stroke-width="2.5"
                    vector-effect="non-scaling-stroke"
                  />
                </svg>
                <div class="hour-axis">
                  <span
                    v-for="hour in [0, 3, 6, 9, 12, 15, 18, 21, 23]"
                    :key="hour"
                    >{{ String(hour).padStart(2, '0') }}时</span
                  >
                </div>
              </n-card>

              <n-card size="small" title="匿名客群结构">
                <div class="segment-grid">
                  <div>
                    <strong>{{
                      analytics.customerSegments.firstObservedVisitors
                    }}</strong
                    ><span>采集期首次到店</span>
                  </div>
                  <div>
                    <strong>{{
                      analytics.customerSegments.returningVisitors
                    }}</strong
                    ><span>历史回访客户</span>
                  </div>
                  <div>
                    <strong>{{
                      analytics.customerSegments.repeatVisitors
                    }}</strong
                    ><span>周期内多日复访</span>
                  </div>
                  <div>
                    <strong>{{
                      analytics.customerSegments.frequentVisitors
                    }}</strong
                    ><span>周期内高频客户</span>
                  </div>
                  <div>
                    <strong>{{
                      analytics.customerSegments.dormantReturnVisitors
                    }}</strong
                    ><span>30天以上回流</span>
                  </div>
                  <div>
                    <strong>{{
                      currency(analytics.traffic.feePerVisitor)
                    }}</strong
                    ><span>每客有效上机金额</span>
                  </div>
                </div>
                <p class="definition-note">
                  “首次到店”表示自
                  {{
                    analytics.customerSegments.historyStartDate ||
                    '现有数据起点'
                  }}
                  以来首次被采集；复访按周期内至少两个不同日期到店计算。
                </p>
              </n-card>

              <n-card size="small" title="每日客流与上座">
                <div class="table-wrap daily-table">
                  <table>
                    <thead>
                      <tr>
                        <th>日期</th>
                        <th>星期</th>
                        <th>到店人次</th>
                        <th>去重客数</th>
                        <th>峰值在线</th>
                        <th>上座率</th>
                        <th>有效金额</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="item in analytics.dailyTraffic"
                        :key="item.date"
                      >
                        <td>{{ item.date }}</td>
                        <td>{{ item.weekdayLabel }}</td>
                        <td>{{ item.sessionStarts }}</td>
                        <td>{{ item.uniqueVisitors }}</td>
                        <td>{{ item.peakConcurrent }}</td>
                        <td>{{ percent(item.seatRate) }}</td>
                        <td>{{ currency(item.feeConsumption) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </n-card>

              <n-card
                size="small"
                :title="`门店上座率排行（${ranking?.availableStoreCount ?? 0} 家）`"
              >
                <div
                  v-if="availableRanking.length"
                  class="table-wrap store-ranking-table"
                >
                  <table>
                    <thead>
                      <tr>
                        <th>排名 / 门店</th>
                        <th>上座率</th>
                        <th>到店人次</th>
                        <th>去重客数</th>
                        <th>复访率</th>
                        <th>平均停留</th>
                        <th>峰值在线</th>
                        <th>判断</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="item in availableRanking"
                        :key="item.store.id"
                        :class="{
                          'bottom-store': item.bottomStore,
                          'selected-store': item.store.id === storeId
                        }"
                      >
                        <td>
                          <strong
                            >{{ item.rank }}.
                            {{ storeDisplayName(item.store) }}</strong
                          >
                        </td>
                        <td>{{ percent(item.seatRate) }}</td>
                        <td>{{ item.sessionStarts }}</td>
                        <td>{{ item.uniqueVisitors }}</td>
                        <td>{{ percent(item.repeatRate) }}</td>
                        <td>{{ compact(item.averageStayHours) }}小时</td>
                        <td>{{ item.peakConcurrent }}</td>
                        <td>
                          <n-tag
                            v-if="item.bottomStore"
                            type="warning"
                            size="small"
                            >重点提升</n-tag
                          ><n-tag v-else type="success" size="small"
                            >正常</n-tag
                          >
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <n-empty v-else description="暂无可排行的门店数据" />
              </n-card>

              <n-card
                v-if="bottomRankingItems.length"
                size="small"
                title="末位门店系统建议"
              >
                <div class="bottom-advice-list">
                  <section
                    v-for="item in bottomRankingItems"
                    :key="item.store.id"
                  >
                    <header>
                      <strong
                        >{{ item.rank }}.
                        {{ storeDisplayName(item.store) }}</strong
                      ><span>上座率 {{ percent(item.seatRate) }}</span>
                    </header>
                    <ul>
                      <li v-for="advice in item.suggestions" :key="advice.code">
                        <b>{{ advice.title }}：</b>{{ advice.action
                        }}<small>{{ advice.evidence }}</small>
                      </li>
                    </ul>
                  </section>
                </div>
              </n-card>
            </div>
          </n-tab-pane>

          <n-tab-pane name="detail" tab="区域与机器明细">
            <div class="tab-stack">
              <div class="panel-grid">
                <n-card size="small" title="区域上机时长及金额">
                  <div class="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>区域</th>
                          <th>机器数</th>
                          <th>人次</th>
                          <th>时长</th>
                          <th>每小时金额</th>
                          <th>上座率</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="item in analytics.areas"
                          :key="item.areaName"
                        >
                          <td>{{ item.areaName }}</td>
                          <td>{{ item.machineCount }}</td>
                          <td>{{ item.sessionCount }}</td>
                          <td>{{ hours(item.usageHours) }}</td>
                          <td>{{ currency(item.feePerUsageHour) }}</td>
                          <td>{{ percent(item.utilizationRate) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </n-card>
                <n-card size="small" title="单机上机与金额排行">
                  <div class="machine-toolbar">
                    <n-input
                      v-model:value="machineSearch"
                      clearable
                      placeholder="搜索机器号或区域"
                    /><n-select
                      v-model:value="machineLimit"
                      :options="machineLimitOptions"
                      class="limit-select"
                    />
                  </div>
                  <div class="table-wrap ranking-table">
                    <table>
                      <thead>
                        <tr>
                          <th>排名 / 机器</th>
                          <th>区域</th>
                          <th>人次</th>
                          <th>时长</th>
                          <th>有效金额</th>
                          <th>上座率</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="(item, index) in visibleMachines"
                          :key="item.machineNumber"
                        >
                          <td>
                            <strong
                              >{{ index + 1 }}. {{ item.machineNumber }}</strong
                            ><n-tag
                              v-if="!item.configured"
                              size="tiny"
                              type="warning"
                              >未同步</n-tag
                            >
                          </td>
                          <td>{{ item.areaName }}</td>
                          <td>{{ item.sessionCount }}</td>
                          <td>{{ hours(item.usageHours) }}</td>
                          <td>{{ currency(item.feeConsumption) }}</td>
                          <td>{{ percent(item.utilizationRate) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </n-card>
              </div>

              <n-card size="small" title="分时上机统计">
                <div
                  class="hour-chart"
                  role="img"
                  aria-label="24小时上机时长柱状图"
                >
                  <div
                    v-for="item in analytics.hourly"
                    :key="item.hour"
                    class="hour-column"
                  >
                    <div>{{ compact(item.usageHours) }}</div>
                    <div class="bar-track">
                      <div
                        class="bar"
                        :style="{
                          height: `${hourBarHeight(item.usageHours)}%`
                        }"
                      />
                    </div>
                    <div>{{ String(item.hour).padStart(2, '0') }}</div>
                  </div>
                </div>
              </n-card>

              <n-card size="small" title="区域每日上座率曲线">
                <div class="area-filter">
                  <n-checkbox-group v-model:value="selectedAreas"
                    ><n-space
                      ><n-checkbox
                        v-for="area in areaNames"
                        :key="area"
                        :value="area"
                        :label="area" /></n-space
                  ></n-checkbox-group>
                </div>
                <div v-if="selectedAreas.length" class="line-chart">
                  <svg
                    :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label="区域每日上座率折线图"
                  >
                    <line
                      v-for="tick in 5"
                      :key="tick"
                      x1="44"
                      :x2="chartWidth - 12"
                      :y1="chartY(((tick - 1) * chartMax) / 4)"
                      :y2="chartY(((tick - 1) * chartMax) / 4)"
                      class="grid-line"
                    />
                    <polyline
                      v-for="(area, index) in selectedAreas"
                      :key="area"
                      :points="linePoints(area)"
                      fill="none"
                      :stroke="chartColors[index % chartColors.length]"
                      stroke-width="2.5"
                      vector-effect="non-scaling-stroke"
                    />
                  </svg>
                  <div class="chart-legend">
                    <span v-for="(area, index) in selectedAreas" :key="area"
                      ><i
                        :style="{
                          background: chartColors[index % chartColors.length]
                        }"
                      />{{ area }}</span
                    >
                  </div>
                  <div class="date-axis">
                    <span>{{ analytics.start }}</span
                    ><span>{{ analytics.end }}</span>
                  </div>
                </div>
                <n-empty v-else description="请选择至少一个区域" />
              </n-card>
            </div>
          </n-tab-pane>
        </n-tabs>
      </template>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { NTabPane, NTabs, NSelect, NDatePicker } from 'naive-ui';
import { computed, onMounted, ref, watch } from 'vue';
import { getV2MasterDataOverview } from '@/api/v2-master-data';
import {
  getV2UsageAnalytics,
  getV2UsageAnalyticsRanking,
  type V2UsageAnalytics,
  type V2UsageAnalyticsRanking
} from '@/api/v2-operations';
import { storeDisplayName } from '@/utils/store-display';

type HeatMetric = 'averageSessionStarts' | 'averageUniqueVisitors' | 'seatRate';
type RankingAvailableItem = Extract<
  V2UsageAnalyticsRanking['items'][number],
  { available: true }
>;
const chinaToday = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai'
}).format(new Date());
const yesterday = new Date(`${chinaToday}T00:00:00Z`);
yesterday.setUTCDate(yesterday.getUTCDate() - 1);
const defaultEnd = yesterday.toISOString().slice(0, 10);
const storeId = ref<string | null>(null);
const dateRange = ref<[string, string]>([
  `${defaultEnd.slice(0, 7)}-01`,
  defaultEnd
]);
const stores = ref<
  Array<{ id: string; name: string; shortName?: string | null; status: string }>
>([]);
const analytics = ref<V2UsageAnalytics | null>(null);
const ranking = ref<V2UsageAnalyticsRanking | null>(null);
const storesLoading = ref(false),
  loading = ref(false);
const error = ref(''),
  rankingError = ref('');
const machineSearch = ref(''),
  machineLimit = ref(50);
const selectedAreas = ref<string[]>([]);
const viewTab = ref('traffic');
const heatMetric = ref<HeatMetric>('averageSessionStarts');
const chartWidth = 920,
  chartHeight = 260,
  trafficChartWidth = 920,
  trafficChartHeight = 260;
const chartColors = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#9333ea',
  '#ea580c',
  '#0891b2',
  '#4f46e5',
  '#be123c'
];
const machineLimitOptions = [
  { label: '前 20 台', value: 20 },
  { label: '前 50 台', value: 50 },
  { label: '全部机器', value: 9999 }
];
const heatMetricOptions = [
  { label: '日均到店人次', value: 'averageSessionStarts' },
  { label: '日均去重客数', value: 'averageUniqueVisitors' },
  { label: '平均上座率', value: 'seatRate' }
];

const storeOptions = computed(() =>
  stores.value
    .filter((item) => item.status !== 'CLOSED')
    .map((item) => ({ label: storeDisplayName(item), value: item.id }))
);
const availableRanking = computed(
  () =>
    ranking.value?.items.filter(
      (item): item is RankingAvailableItem => item.available
    ) ?? []
);
const bottomRankingItems = computed(() =>
  availableRanking.value.filter((item) => item.bottomStore)
);
const selectedRanking = computed(
  () =>
    availableRanking.value.find((item) => item.store.id === storeId.value) ??
    null
);
const selectedStrategies = computed(
  () => selectedRanking.value?.suggestions ?? []
);
const visibleMachines = computed(() => {
  const keyword = machineSearch.value.trim().toLowerCase();
  return (analytics.value?.machines ?? [])
    .filter(
      (item) =>
        !keyword ||
        item.machineNumber.toLowerCase().includes(keyword) ||
        item.areaName.toLowerCase().includes(keyword)
    )
    .slice(0, machineLimit.value);
});
const areaNames = computed(
  () =>
    analytics.value?.areas
      .filter((item) => item.machineCount > 0)
      .map((item) => item.areaName) ?? []
);
const chartMax = computed(() =>
  Math.max(10, ...selectedAreas.value.flatMap((area) => dailyRates(area)))
);
const maxHourly = computed(() =>
  Math.max(
    1,
    ...(analytics.value?.hourly.map((item) => item.usageHours) ?? [1])
  )
);
const heatMax = computed(() =>
  Math.max(
    1,
    ...(analytics.value?.weekdayHourly.map((item) =>
      Number(item[heatMetric.value] ?? 0)
    ) ?? [1])
  )
);
const trafficMax = computed(() =>
  Math.max(
    1,
    ...(analytics.value?.hourly.flatMap((item) => [
      item.averageSessionStarts,
      item.averageSessionEnds,
      item.averageConcurrent
    ]) ?? [1])
  )
);

async function loadStores() {
  storesLoading.value = true;
  try {
    stores.value = (await getV2MasterDataOverview()).stores;
    storeId.value ||= storeOptions.value[0]?.value ?? null;
  } finally {
    storesLoading.value = false;
  }
}
async function loadDashboard(includeRanking = true) {
  if (!storeId.value || !dateRange.value?.[0] || !dateRange.value?.[1]) return;
  loading.value = true;
  error.value = '';
  if (includeRanking) rankingError.value = '';
  const tasks: Promise<unknown>[] = [
    getV2UsageAnalytics(storeId.value, dateRange.value[0], dateRange.value[1])
  ];
  if (includeRanking || !ranking.value)
    tasks.push(
      getV2UsageAnalyticsRanking(dateRange.value[0], dateRange.value[1])
    );
  const results = await Promise.allSettled(tasks);
  try {
    const analyticsResult = results[0];
    if (analyticsResult.status === 'rejected') throw analyticsResult.reason;
    analytics.value = analyticsResult.value as V2UsageAnalytics;
    selectedAreas.value = analytics.value.areas
      .filter((item) => item.machineCount > 0)
      .slice(0, 6)
      .map((item) => item.areaName);
    if (results[1]) {
      if (results[1].status === 'fulfilled')
        ranking.value = results[1].value as V2UsageAnalyticsRanking;
      else
        rankingError.value = '门店上座率排行暂不可用，单店客流数据不受影响。';
    }
  } catch (caught) {
    analytics.value = null;
    error.value =
      caught instanceof Error
        ? caught.message
        : '客流运营数据暂不可用，请稍后重试。';
  } finally {
    loading.value = false;
  }
}
function money(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}
function currency(value: number) {
  return `¥${money(value)}`;
}
function hours(value: number) {
  return `${money(value)} 小时`;
}
function percent(value: number | null) {
  return value == null ? '—' : `${money(value)}%`;
}
function compact(value: number) {
  return value >= 100 ? Math.round(value).toString() : value.toFixed(1);
}
function hourBarHeight(value: number) {
  return Math.max(value ? 3 : 0, (value / maxHourly.value) * 100);
}
function weekdayLabel(value: number) {
  return ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][value - 1];
}
function heatmapRow(weekday: number) {
  return (
    analytics.value?.weekdayHourly.filter((item) => item.weekday === weekday) ??
    []
  );
}
function heatValue(item: V2UsageAnalytics['weekdayHourly'][number]) {
  return Number(item[heatMetric.value] ?? 0);
}
function heatStyle(item: V2UsageAnalytics['weekdayHourly'][number]) {
  const ratio = heatValue(item) / heatMax.value;
  return {
    background: `rgba(37, 99, 235, ${0.06 + ratio * 0.86})`,
    color: ratio > 0.55 ? '#fff' : '#1e293b'
  };
}
function heatText(item: V2UsageAnalytics['weekdayHourly'][number]) {
  const value = heatValue(item);
  return heatMetric.value === 'seatRate'
    ? `${value.toFixed(0)}%`
    : value.toFixed(1);
}
function heatTooltip(item: V2UsageAnalytics['weekdayHourly'][number]) {
  return `${item.weekdayLabel} ${String(item.hour).padStart(2, '0')}:00｜日均到店 ${item.averageSessionStarts}｜日均客数 ${item.averageUniqueVisitors}｜上座率 ${percent(item.seatRate)}｜峰值在线 ${item.peakConcurrent}`;
}
function trafficY(value: number) {
  return (
    trafficChartHeight -
    24 -
    (value / trafficMax.value) * (trafficChartHeight - 48)
  );
}
function trafficPoints(
  key: 'averageSessionStarts' | 'averageSessionEnds' | 'averageConcurrent'
) {
  const values = analytics.value?.hourly ?? [];
  return values
    .map(
      (item, index) =>
        `${36 + (index / 23) * (trafficChartWidth - 48)},${trafficY(item[key])}`
    )
    .join(' ');
}
function dailyRates(area: string) {
  return (
    analytics.value?.dailyAreas.map(
      (day) =>
        day.areas.find((item) => item.areaName === area)?.utilizationRate ?? 0
    ) ?? []
  );
}
function chartY(value: number) {
  return chartHeight - 24 - (value / chartMax.value) * (chartHeight - 48);
}
function linePoints(area: string) {
  const values = dailyRates(area);
  return values
    .map(
      (value, index) =>
        `${44 + (index / Math.max(1, values.length - 1)) * (chartWidth - 56)},${chartY(value)}`
    )
    .join(' ');
}
watch(storeId, () => loadDashboard(false));
onMounted(loadStores);
</script>

<style scoped>
.page-stack,
.tab-stack {
  display: grid;
  gap: 16px;
}
.section-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
.section-head h1 {
  margin: 0;
}
.section-head p {
  margin: 6px 0 0;
  color: #64748b;
}
.store-select {
  width: 240px;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}
.panel-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.table-wrap {
  overflow: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  padding: 9px 10px;
  border-bottom: 1px solid #e5e7eb;
  text-align: right;
  white-space: nowrap;
}
th:first-child,
td:first-child,
th:nth-child(2),
td:nth-child(2) {
  text-align: left;
}
thead {
  background: #f8fafc;
}
.advice-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.advice-card {
  border: 1px solid #dbeafe;
  background: #f8fbff;
  border-radius: 10px;
  padding: 14px;
}
.advice-card h3 {
  margin: 0 0 8px;
  color: #1d4ed8;
}
.advice-card p {
  margin: 5px 0;
  line-height: 1.6;
}
.advice-card .evidence {
  color: #64748b;
  font-size: 13px;
}
.chart-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  color: #64748b;
}
.metric-select {
  width: 190px;
}
.heatmap-wrap {
  overflow-x: auto;
}
.heatmap-grid {
  display: grid;
  grid-template-columns: 58px repeat(24, minmax(38px, 1fr));
  gap: 3px;
  min-width: 1040px;
}
.heat-corner,
.heat-head,
.heat-weekday {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  font-size: 12px;
}
.heat-cell {
  height: 38px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  cursor: default;
}
.traffic-legend,
.chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: center;
}
.traffic-legend span,
.chart-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.traffic-legend i,
.chart-legend i {
  width: 18px;
  height: 3px;
  border-radius: 2px;
}
.traffic-legend .arrivals {
  background: #2563eb;
}
.traffic-legend .departures {
  background: #ea580c;
}
.traffic-legend .concurrent {
  background: #16a34a;
}
.traffic-chart,
.line-chart svg {
  width: 100%;
  height: 300px;
  overflow: visible;
}
.grid-line {
  stroke: #e2e8f0;
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.hour-axis,
.date-axis {
  display: flex;
  justify-content: space-between;
  margin: 4px 12px 0 36px;
  color: #64748b;
  font-size: 12px;
}
.segment-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}
.segment-grid div {
  display: grid;
  gap: 5px;
  text-align: center;
  padding: 15px 8px;
  background: #f8fafc;
  border-radius: 8px;
}
.segment-grid strong {
  font-size: 22px;
  color: #0f172a;
}
.segment-grid span,
.definition-note {
  color: #64748b;
  font-size: 12px;
}
.definition-note {
  margin: 12px 0 0;
}
.daily-table {
  max-height: 380px;
}
.store-ranking-table {
  max-height: 580px;
}
.bottom-store {
  background: #fff7ed;
}
.selected-store {
  outline: 2px solid #93c5fd;
  outline-offset: -2px;
}
.bottom-advice-list {
  display: grid;
  gap: 14px;
}
.bottom-advice-list section {
  border: 1px solid #fed7aa;
  background: #fffaf5;
  border-radius: 10px;
  padding: 14px;
}
.bottom-advice-list header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.bottom-advice-list ul {
  margin: 10px 0 0;
  padding-left: 20px;
}
.bottom-advice-list li {
  margin: 8px 0;
  line-height: 1.6;
}
.bottom-advice-list small {
  display: block;
  color: #64748b;
}
.ranking-table {
  max-height: 520px;
}
.machine-toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}
.limit-select {
  width: 130px;
}
.hour-chart {
  display: grid;
  grid-template-columns: repeat(24, minmax(24px, 1fr));
  gap: 5px;
  height: 230px;
  overflow-x: auto;
  align-items: end;
  padding: 8px 0 14px;
}
.hour-column {
  display: grid;
  grid-template-rows: 22px 160px 22px;
  min-width: 24px;
  text-align: center;
  font-size: 11px;
  color: #64748b;
}
.bar-track {
  display: flex;
  align-items: end;
  background: #f1f5f9;
  border-radius: 4px 4px 0 0;
  overflow: hidden;
}
.bar {
  width: 100%;
  background: linear-gradient(180deg, #60a5fa, #2563eb);
}
.area-filter {
  margin-bottom: 14px;
}
.line-chart {
  position: relative;
}
.date-axis {
  margin-left: 44px;
}
@media (max-width: 1200px) {
  .summary-grid,
  .segment-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .advice-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 900px) {
  .section-head {
    flex-direction: column;
  }
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .panel-grid {
    grid-template-columns: 1fr;
  }
  .store-select {
    width: 100%;
  }
}
@media (max-width: 640px) {
  .summary-grid,
  .segment-grid {
    grid-template-columns: 1fr;
  }
  .section-head :deep(.n-space),
  .section-head :deep(.n-date-picker) {
    width: 100%;
  }
  .chart-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
  .metric-select {
    width: 100%;
  }
}
</style>
