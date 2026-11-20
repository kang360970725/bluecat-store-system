<template>
  <div class="page-stack">
    <div class="section-head">
      <div>
        <h1>门店中心</h1>
        <p>从门店进入完整经营档案，不再把资料分散到多个菜单。</p>
      </div>
      <n-button :loading="loading" @click="load">刷新</n-button>
    </div>
    <n-card class="all-store-performance" :bordered="false">
      <div class="summary-heading">
        <div>
          <span>经营总览</span>
          <h2>{{ summaryTitle }}</h2>
        </div>
        <div class="month-tools">
          <n-button-group
            ><n-button @click="moveMonth(-1)">‹</n-button
            ><n-button class="month-trigger" @click="monthPanelOpen = true">{{
              monthLabel
            }}</n-button
            ><n-button
              :disabled="selectedMonthText >= currentMonth"
              @click="moveMonth(1)"
              >›</n-button
            ></n-button-group
          ><n-button
            secondary
            :disabled="isCurrentMonth"
            @click="chooseMonth(currentMonth)"
            >本月</n-button
          >
        </div>
      </div>
      <div class="summary-metrics">
        <div>
          <span>{{ metricMonth }}总目标</span
          ><strong>¥{{ money(summaryTarget) }}</strong
          ><small>{{ configuredTargetCount }} 家门店已设置目标</small>
        </div>
        <div class="primary-summary">
          <span>{{ metricMonth }}总收入</span
          ><strong>¥{{ money(summaryRevenue) }}</strong
          ><small>{{ summaryStoreLabel }}收入合计</small>
        </div>
        <div>
          <span>{{ metricMonth }}预计收入</span
          ><strong>{{
            forecastAvailable ? `¥${money(summaryEstimatedRevenue)}` : '—'
          }}</strong
          ><small>{{
            isCurrentMonth ? '按截至昨日的日均收入推算' : '历史月份按整月统计'
          }}</small>
        </div>
        <div>
          <span>预计完成率</span
          ><strong>{{
            !summaryTarget
              ? '未设目标'
              : forecastAvailable
                ? percent(summaryEstimatedCompletionRate)
                : '—'
          }}</strong
          ><small>预计收入 ÷ 总目标</small>
        </div>
        <div>
          <span>当前平均完成率</span
          ><strong>{{ percent(averageCompletionRate) }}</strong
          ><small>已设目标门店平均</small>
        </div>
        <div>
          <span>{{ metricMonth }}利润目标</span
          ><strong>¥{{ money(summaryProfitTarget) }}</strong
          ><small>{{ summaryStoreLabel }}利润目标合计</small>
        </div>
        <div>
          <span>{{ metricMonth }}总利润</span
          ><strong :class="summaryProfit >= 0 ? 'positive' : 'negative'"
            >¥{{ money(summaryProfit) }}</strong
          ><small>营业额 − 成本</small>
        </div>
        <div class="forecast-summary">
          <span>{{ metricMonth }}预计利润总和</span
          ><strong class="positive">{{
            forecastAvailable ? `¥${money(positiveStoreEstimatedProfit)}` : '—'
          }}</strong
          ><small>仅统计预计利润为正的门店</small
          ><small v-if="forecastAvailable" class="excluded-loss"
            >不含：-¥{{
              money(estimatedLossAbsolute)
            }}（预计亏损门店合计）</small
          >
        </div>
        <div>
          <span>{{ metricMonth }}利润预计完成率</span
          ><strong>{{
            !summaryProfitTarget
              ? '未设目标'
              : forecastAvailable
                ? percent(summaryEstimatedProfitCompletionRate)
                : '—'
          }}</strong
          ><small>预计利润总和 ÷ 利润目标总和</small>
        </div>
        <div>
          <span>利润平均完成率</span
          ><strong>{{ percent(averageProfitCompletionRate) }}</strong
          ><small>已设利润目标门店平均</small>
        </div>
      </div>
      <div class="store-counts">
        <span>{{ summaryStoreLabel }} {{ summaryStores.length }}</span
        ><span>营业中 {{ operatingCount }}</span>
      </div>
    </n-card>
    <n-card title="门店经营档案" :bordered="false">
      <n-empty
        v-if="!visibleStores.length && !loading"
        description="暂无可展示的门店档案"
      />
      <n-data-table
        v-else
        :columns="columns"
        :data="visibleStores"
        :scroll-x="1480"
        :row-class-name="storeRowClass"
      />
    </n-card>
    <n-modal
      v-model:show="monthPanelOpen"
      preset="card"
      title="选择月份"
      class="month-modal"
    >
      <month-grid-picker
        v-model="monthPanelValue"
        :max-month="currentMonth"
        @update:model-value="chooseMonth"
      />
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue';
import { NDataTable, NButton, NProgress, NTag, type DataTableColumns } from 'naive-ui';
import { useRoute, useRouter } from 'vue-router';
import { getV2StoreCenterRanking, type V2StoreCenterRanking } from '@/api/v2-operations';
import { storeDisplayName } from '@/utils/store-display';
import MonthGridPicker from '@/components/MonthGridPicker.vue';

type StoreRow = V2StoreCenterRanking['items'][number];
const router = useRouter();
const route = useRoute();
const loading = ref(false);
const ranking = ref<V2StoreCenterRanking | null>(null);
const monthPanelOpen = ref(false);
const currentMonth = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit'
}).format(new Date());
const routeMonth =
  typeof route.query.month === 'string' &&
  /^\d{4}-\d{2}$/.test(route.query.month) &&
  route.query.month <= currentMonth
    ? route.query.month
    : currentMonth;
const selectedMonthText = ref(routeMonth);
const monthPanelValue = ref(routeMonth);
const monthLabel = computed(
  () =>
    `${selectedMonthText.value.slice(0, 4)}年${Number(selectedMonthText.value.slice(5, 7))}月`
);
const isCurrentMonth = computed(() => selectedMonthText.value === currentMonth);
const forecastAvailable = computed(() => (ranking.value?.elapsedDays ?? 0) > 0);
const metricMonth = computed(() =>
  isCurrentMonth.value ? '本月' : monthLabel.value
);
const stores = computed(() => ranking.value?.items ?? []);
const visibleStores = computed<StoreRow[]>(() =>
  stores.value
    .filter((item) => item.status !== 'CLOSED')
    .sort(
      (a, b) =>
        Number(b.profitTarget !== 0) - Number(a.profitTarget !== 0) ||
        b.estimatedProfitCompletionRate - a.estimatedProfitCompletionRate ||
        b.estimatedProfit - a.estimatedProfit
    )
    .map((item, index) => ({ ...item, rank: index + 1 }))
);
const summaryStoreLabel = computed(() => {
  if (ranking.value?.summaryScope === 'all') return '全部门店';
  return ranking.value?.summaryScope === 'managed' ? '管理门店' : '授权门店';
});
const summaryStores = computed(() => {
  const ids = new Set(ranking.value?.summaryStoreIds ?? []);
  return stores.value.filter(store => ids.has(store.id));
});
const summaryTitle = computed(() => {
  if (ranking.value?.summaryScope === 'all') return '全门店总业绩';
  if (summaryStores.value.length === 1) return `${storeDisplayName(summaryStores.value[0])}业绩`;
  return `${summaryStoreLabel.value}总业绩`;
});
const operatingCount = computed(
  () => summaryStores.value.filter((item) => item.status === 'OPERATING').length
);
const summaryRevenue = computed(() =>
  summaryStores.value.reduce((sum, item) => sum + item.monthTotal, 0)
);
const summaryTarget = computed(() =>
  summaryStores.value.reduce((sum, item) => sum + Number(item.target || 0), 0)
);
const summaryEstimatedRevenue = computed(() =>
  summaryStores.value.reduce((sum, item) => sum + item.estimatedRevenue, 0)
);
const summaryEstimatedCompletionRate = computed(() =>
  summaryTarget.value
    ? summaryEstimatedRevenue.value / summaryTarget.value
    : 0
);
const summaryProfit = computed(() =>
  summaryStores.value.reduce((sum, item) => sum + item.actualProfit, 0)
);
const summaryEstimatedProfit = computed(() =>
  summaryStores.value.reduce((sum, item) => sum + item.estimatedProfit, 0)
);
const positiveStoreEstimatedProfit = computed(() =>
  summaryStores.value
    .filter((item) => item.estimatedProfit > 0)
    .reduce((sum, item) => sum + item.estimatedProfit, 0)
);
const estimatedLossAbsolute = computed(() =>
  Math.abs(
    summaryStores.value
      .filter((item) => item.estimatedProfit < 0)
      .reduce((sum, item) => sum + item.estimatedProfit, 0)
  )
);
const summaryProfitTarget = computed(() =>
  summaryStores.value.reduce((sum, item) => sum + Number(item.profitTarget || 0), 0)
);
const summaryEstimatedProfitCompletionRate = computed(() =>
  summaryProfitTarget.value
    ? summaryEstimatedProfit.value / summaryProfitTarget.value
    : 0
);
const configuredTargetCount = computed(
  () => summaryStores.value.filter((item) => item.target > 0).length
);
const average = (values: number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
const averageCompletionRate = computed(() =>
  average(
    summaryStores.value
      .filter((item) => item.target > 0)
      .map((item) => item.completionRate)
  )
);
const averageProfitCompletionRate = computed(() =>
  average(
    summaryStores.value
      .filter((item) => item.profitTarget !== 0)
      .map((item) => item.profitCompletionRate)
  )
);
function money(value: number) {
  return Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
function percent(value: number) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}
function moneyCompareCell(
  rows: Array<{ label: string; value: number | null; tone?: string }>
) {
  return h(
    'div',
    { class: 'compare-cell money-compare' },
    rows.map((item) =>
      h('div', { class: 'compare-row' }, [
        h('span', item.label),
        h(
          'strong',
          { class: item.tone },
          item.value === null ? '—' : `¥${money(item.value)}`
        )
      ])
    )
  );
}
function rateCompareCell(
  current: number,
  estimated: number | null,
  target: number
) {
  return h(
    'div',
    { class: 'compare-cell rate-compare' },
    [
      { label: '当前', value: current },
      { label: '预计', value: estimated }
    ].map((item) =>
      h('div', { class: 'rate-compare-row' }, [
        h('span', item.label),
        h(
          'strong',
          { class: (item.value ?? 0) >= 1 ? 'positive' : '' },
          !target ? '未设目标' : item.value === null ? '—' : percent(item.value)
        ),
        target && item.value !== null
          ? h(NProgress, {
              type: 'line',
              percentage: Math.min(100, Math.max(0, item.value * 100)),
              showIndicator: false,
              color: item.value >= 1 ? '#18a058' : '#2080f0',
              railColor: 'rgba(32,128,240,.12)'
            })
          : null
      ])
    )
  );
}
const columns = computed<DataTableColumns<StoreRow>>(() => [
  {
    title: '门店',
    key: 'name',
    width: 220,
    render: (row) =>
      h(
        'span',
        { class: 'store-name-cell', title: row.name },
        storeDisplayName(row)
      )
  },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render: (row) =>
      h(
        NTag,
        {
          type: row.status === 'OPERATING' ? 'success' : 'default',
          size: 'small'
        },
        { default: () => (row.status === 'OPERATING' ? '营业中' : row.status) }
      )
  },
  {
    title: `${isCurrentMonth.value ? '本月' : monthLabel.value}收入 / 目标`,
    key: 'monthTotal',
    width: 190,
    sorter: (a, b) => a.monthTotal - b.monthTotal,
    render: (row) =>
      moneyCompareCell([
        { label: '收入', value: row.monthTotal, tone: 'income-value' },
        { label: '目标', value: row.target }
      ])
  },
  {
    title: '营收完成率',
    key: 'completionRate',
    width: 220,
    sorter: (a, b) => a.estimatedCompletionRate - b.estimatedCompletionRate,
    render: (row) =>
      rateCompareCell(
        row.completionRate,
        forecastAvailable.value ? row.estimatedCompletionRate : null,
        row.target
      )
  },
  {
    title: `${isCurrentMonth.value ? '本月' : monthLabel.value}利润`,
    key: 'actualProfit',
    width: 140,
    sorter: (a, b) => a.actualProfit - b.actualProfit,
    render: (row) =>
      h(
        'strong',
        { class: row.actualProfit >= 0 ? 'positive' : 'negative' },
        `¥${money(row.actualProfit)}`
      )
  },
  {
    title: '预计利润 / 目标',
    key: 'estimatedProfit',
    width: 190,
    sorter: (a, b) => a.estimatedProfit - b.estimatedProfit,
    render: (row) =>
      moneyCompareCell([
        {
          label: '预计',
          value: forecastAvailable.value ? row.estimatedProfit : null,
          tone: row.estimatedProfit >= 0 ? 'positive' : 'negative'
        },
        { label: '目标', value: row.profitTarget }
      ])
  },
  {
    title: '利润完成率',
    key: 'estimatedProfitCompletionRate',
    width: 220,
    defaultSortOrder: 'descend',
    sorter: (a, b) =>
      Number(a.profitTarget !== 0) - Number(b.profitTarget !== 0) ||
      a.estimatedProfitCompletionRate - b.estimatedProfitCompletionRate ||
      a.estimatedProfit - b.estimatedProfit,
    render: (row) =>
      rateCompareCell(
        row.profitCompletionRate,
        forecastAvailable.value ? row.estimatedProfitCompletionRate : null,
        row.profitTarget
      )
  },
  {
    title: '排名',
    key: 'rank',
    width: 80,
    render: (row) =>
      h(
        'span',
        { class: `rank-badge rank-${Math.min(row.rank, 4)}` },
        row.rank <= 3
          ? `${['🥇', '🥈', '🥉'][row.rank - 1]} ${row.rank}`
          : `#${row.rank}`
      )
  },
  {
    title: '操作',
    key: 'actions',
    width: 120,
    fixed: 'right',
    render: (row) =>
      row.canOpenWorkspace ? h(
        NButton,
        {
          type: 'primary',
          secondary: true,
          size: 'small',
          onClick: () =>
            router.push({
              name: 'v2-store-workspace',
              params: { storeId: row.id },
              query: { month: selectedMonthText.value }
            })
        },
        { default: () => '进入工作台' }
      ) : '—'
  }
]);
function storeRowClass(row: StoreRow) {
  return row.rank <= 3 ? `profit-rank-row profit-rank-${row.rank}` : '';
}

function chooseMonth(value: string) {
  selectedMonthText.value = value;
  monthPanelValue.value = value;
  monthPanelOpen.value = false;
  void router.replace({
    name: 'v2-store-center',
    query: { ...route.query, month: value }
  });
  void loadRanking();
}
function moveMonth(delta: number) {
  const [year, month] = selectedMonthText.value.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  const value = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
  if (value <= currentMonth) chooseMonth(value);
}
async function loadRanking() {
  loading.value = true;
  try {
    ranking.value = await getV2StoreCenterRanking(selectedMonthText.value);
  } finally {
    loading.value = false;
  }
}
const load = loadRanking;
onMounted(() => void load());
</script>

<style scoped>
:deep(.compare-cell) {
  display: grid;
  gap: 7px;
}
:deep(.compare-row) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
:deep(.compare-row span),
:deep(.rate-compare-row > span) {
  color: #98a2b3;
  font-size: 11px;
}
:deep(.compare-row strong) {
  font-size: 13px;
  white-space: nowrap;
}
:deep(.income-value) {
  color: #1677ff;
}
:deep(.rate-compare-row) {
  display: grid;
  grid-template-columns: 30px 50px minmax(65px, 1fr);
  align-items: center;
  gap: 6px;
}
:deep(.rate-compare-row strong) {
  font-size: 12px;
  white-space: nowrap;
}
:deep(.rank-badge) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 42px;
  height: 26px;
  padding: 0 8px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 12px;
  background: #f2f4f7;
  color: #667085;
}
:deep(.rank-1) {
  background: linear-gradient(135deg, #fff1b8, #ffd666);
  color: #874d00;
  box-shadow: 0 3px 10px rgba(250, 173, 20, 0.24);
}
:deep(.rank-2) {
  background: linear-gradient(135deg, #f5f7fa, #d9e0e8);
  color: #475467;
  box-shadow: 0 3px 10px rgba(71, 84, 103, 0.14);
}
:deep(.rank-3) {
  background: linear-gradient(135deg, #fbe4d5, #dca67a);
  color: #7a3e16;
  box-shadow: 0 3px 10px rgba(180, 100, 50, 0.16);
}
:deep(.profit-rank-1 td) {
  background: rgba(255, 248, 225, 0.66) !important;
}
:deep(.profit-rank-2 td) {
  background: rgba(247, 249, 252, 0.86) !important;
}
:deep(.profit-rank-3 td) {
  background: rgba(255, 245, 238, 0.62) !important;
}
:deep(.profit-rank-row:hover td) {
  filter: brightness(0.985);
}
:deep(.store-name-cell) {
  display: block;
  max-width: 208px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
:deep(.positive) {
  color: #18a058;
}
:deep(.negative),
.negative {
  color: #d03050;
}
.all-store-performance {
  background: linear-gradient(135deg, #f4f8ff 0%, #fff 58%, #f1fbf7 100%);
  border: 1px solid rgba(32, 128, 240, 0.16);
  box-shadow: 0 12px 32px rgba(30, 64, 175, 0.08);
}
.summary-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}
.month-tools {
  display: flex;
  align-items: center;
  gap: 10px;
}
.month-trigger {
  min-width: 112px;
}
.summary-heading span {
  color: #667085;
  font-size: 12px;
}
.summary-heading h2 {
  margin: 3px 0 0;
  font-size: 22px;
}
.summary-metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}
.summary-metrics > div {
  min-width: 0;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(148, 163, 184, 0.18);
}
.summary-metrics span,
.summary-metrics small {
  display: block;
  color: #667085;
}
.summary-metrics strong {
  display: block;
  margin: 7px 0 4px;
  font-size: 22px;
  white-space: nowrap;
}
.primary-summary strong {
  font-size: 28px;
  color: #1677ff;
}
.forecast-summary {
  background: linear-gradient(
    135deg,
    rgba(236, 253, 245, 0.95),
    rgba(255, 255, 255, 0.82)
  ) !important;
}
.summary-metrics .excluded-loss {
  margin-top: 5px;
  color: #d03050;
  font-weight: 600;
}
.store-counts {
  display: flex;
  gap: 18px;
  margin-top: 14px;
  color: #667085;
  font-size: 13px;
}
@media (max-width: 1200px) {
  .summary-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 640px) {
  .summary-metrics {
    grid-template-columns: 1fr;
  }
  .summary-metrics strong {
    font-size: 20px;
  }
}
</style>
