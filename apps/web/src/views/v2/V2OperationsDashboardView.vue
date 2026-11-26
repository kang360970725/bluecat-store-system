<template>
  <div class="page-stack">
    <div class="section-head">
      <div><h1>运营报表</h1><p>查看已生成的单门店完整周报、月报，并支持导出总览图片。</p></div>
      <n-space>
        <n-radio-group v-model:value="periodType" size="small">
          <n-radio-button value="MONTH">月报</n-radio-button><n-radio-button value="WEEK">周报</n-radio-button>
        </n-radio-group>
        <n-select v-model:value="storeId" :options="storeOptions" class="store-select" placeholder="选择门店" />
        <n-date-picker v-if="periodType === 'MONTH'" v-model:formatted-value="month" type="month" value-format="yyyy-MM" :clearable="false" />
        <n-select
          v-else
          v-model:value="weekDate"
          :options="weekOptions"
          class="week-select"
          filterable
          placeholder="选择完整自然周"
        />
        <n-button :loading="loading" @click="loadReport">刷新</n-button>
        <n-button v-if="report?.generated" :loading="exporting" @click="exportImage">导出图片</n-button>
        <n-button v-if="isSuperAdmin" type="primary" :loading="generating" @click="showGenerate = true">
          {{ report?.generated ? '重新生成' : '生成报表' }}
        </n-button>
      </n-space>
    </div>
    <n-alert v-if="error" type="error" :bordered="false">{{ error }}</n-alert>
    <n-spin :show="loading || storesLoading">
      <n-empty v-if="!storeId" description="请选择门店" />
      <n-empty v-else-if="report && !report.generated" :description="report.error || '该周期尚未生成报表'" />
      <div v-else-if="report?.generated" ref="reportElement" class="report-sheet">
        <header class="report-title">
          <div><h2>{{ storeDisplayName(report.store) }} · {{ periodType === 'MONTH' ? '运营月报' : '运营周报' }}</h2><p>{{ report.startDate }} 至 {{ report.endDate }}</p></div>
          <div class="report-meta"><span>机器台数 {{ report.machineCount ?? report.store.machineCount }}</span><span>生成于 {{ generatedAtText }}</span></div>
        </header>
        <div class="report-grid">
          <section v-for="group in report.groups" :key="group.code" class="report-panel">
            <h3>{{ group.label }}</h3>
            <div class="table-wrap"><table>
              <thead><tr><th>指标</th><th>上期</th><th>本期</th><th>环比</th></tr></thead>
              <tbody><tr v-for="item in group.metrics" :key="item.code">
                <td>{{ item.label }}</td><td>{{ metricText(item.previous, item.unit) }}</td><td>{{ metricText(item.current, item.unit) }}</td>
                <td :class="changeClass(item.changeRate)">{{ changeText(item.changeRate) }}</td>
              </tr></tbody>
            </table></div>
          </section>
          <section class="report-panel">
            <h3>收入构成</h3>
            <div class="table-wrap"><table>
              <thead><tr><th>收款渠道</th><th>金额</th><th>占主营业务收入</th></tr></thead>
              <tbody><tr v-for="item in report.incomeComposition || []" :key="item.code">
                <td>{{ item.label }}</td><td>{{ currencyText(item.amount) }}</td><td>{{ percentText(item.percentage) }}</td>
              </tr></tbody>
            </table></div>
          </section>
          <section class="report-panel">
            <h3>团购收入构成</h3>
            <div class="table-wrap"><table>
              <thead><tr><th>类型</th><th>上期</th><th>本期</th><th>环比</th><th>占网费收入</th></tr></thead>
              <tbody><tr v-for="item in report.groupPurchase || []" :key="item.code">
                <td>{{ item.label }}</td><td>{{ currencyText(item.previousAmount) }}</td><td>{{ currencyText(item.currentAmount) }}</td>
                <td :class="changeClass(item.changeRate)">{{ changeText(item.changeRate) }}</td><td>{{ percentText(item.percentage) }}</td>
              </tr></tbody>
            </table></div>
          </section>
        </div>
      </div>
    </n-spin>
    <n-modal v-model:show="showGenerate" preset="card" title="生成报表" class="generate-modal">
      <p>请选择本次生成方式。重新同步会按当前周期重新获取 X 系统数据，耗时更长。</p>
      <n-space justify="end"><n-button @click="showGenerate = false">取消</n-button><n-button :loading="generating" @click="generate(false)">使用现有数据生成</n-button><n-button type="primary" :loading="generating" @click="generate(true)">重新同步后生成</n-button></n-space>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { toPng } from 'html-to-image';
import { NDatePicker, useMessage } from 'naive-ui';
import { NSelect } from '@/components/Select';
import { getV2MasterDataOverview } from '@/api/v2-master-data';
import { generateV2OperationsReport, getV2OperationsMonthlyReport, getV2OperationsWeeklyReport, type V2OperationsMonthlyReport } from '@/api/v2-operations';
import { useAuthStore } from '@/stores/auth';
import { storeDisplayName } from '@/utils/store-display';

const chinaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
const shiftMonth = (value: string, offset: number) => { const [year, month] = value.split('-').map(Number); return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7); };
const previousWeek = () => { const anchor = new Date(`${chinaDate}T00:00:00Z`); const weekday = (anchor.getUTCDay() + 6) % 7; return new Date(anchor.getTime() - (weekday + 7) * 86_400_000).toISOString().slice(0, 10); };
const formatWeekDay = (value: Date) => `${value.getUTCFullYear()}年${value.getUTCMonth() + 1}月${value.getUTCDate()}日`;
const auth = useAuthStore();
const message = useMessage();
const periodType = ref<'MONTH' | 'WEEK'>('MONTH');
const month = ref(shiftMonth(chinaDate.slice(0, 7), -1));
const weekDate = ref(previousWeek());
const storeId = ref<string | null>(null);
const stores = ref<Array<{ id: string; name: string; shortName?: string | null; status: string }>>([]);
const storesLoading = ref(false), loading = ref(false), generating = ref(false), exporting = ref(false), showGenerate = ref(false);
const error = ref('');
const report = ref<V2OperationsMonthlyReport | null>(null);
const reportElement = ref<HTMLElement | null>(null);
const isSuperAdmin = computed(() => auth.user?.roles.includes('super_admin') === true);
const storeOptions = computed(() => stores.value.map((item) => ({ label: storeDisplayName(item), value: item.id })));
const weekOptions = computed(() => {
  const latestMonday = new Date(`${previousWeek()}T00:00:00Z`);
  return Array.from({ length: 160 }, (_, index) => {
    const monday = new Date(latestMonday.getTime() - index * 7 * 86_400_000);
    const sunday = new Date(monday.getTime() + 6 * 86_400_000);
    return {
      value: monday.toISOString().slice(0, 10),
      label: `${formatWeekDay(monday)}—${formatWeekDay(sunday)}（周一至周日）`
    };
  });
});
const generatedAtText = computed(() => report.value?.generatedAt ? new Date(report.value.generatedAt).toLocaleString('zh-CN') : '—');

async function loadStores() { storesLoading.value = true; try { stores.value = (await getV2MasterDataOverview()).stores; storeId.value ||= storeOptions.value[0]?.value ?? null; } finally { storesLoading.value = false; } }
async function loadReport() {
  if (!storeId.value) return;
  loading.value = true; error.value = '';
  try { report.value = periodType.value === 'MONTH' ? await getV2OperationsMonthlyReport(storeId.value, month.value) : await getV2OperationsWeeklyReport(storeId.value, weekDate.value); }
  catch { report.value = null; error.value = '运营报表暂不可用，请稍后重试。'; } finally { loading.value = false; }
}
async function generate(resync: boolean) {
  if (!storeId.value) return;
  generating.value = true; error.value = '';
  try {
    report.value = await generateV2OperationsReport(storeId.value, { periodType: periodType.value, period: periodType.value === 'MONTH' ? month.value : weekDate.value, resync });
    showGenerate.value = false; message.success('报表已生成');
  } catch (caught) { error.value = caught instanceof Error ? caught.message : '报表生成失败，请稍后重试。'; } finally { generating.value = false; }
}
async function exportImage() {
  if (!reportElement.value || !report.value) return;
  exporting.value = true;
  try {
    await nextTick();
    const dataUrl = await toPng(reportElement.value, { pixelRatio: 2, backgroundColor: '#f8fafc', cacheBust: true });
    const link = document.createElement('a');
    link.download = `${report.value.store.shortName || report.value.store.name}-${report.value.periodKey}-${periodType.value === 'MONTH' ? '月报' : '周报'}.png`; link.href = dataUrl; link.click();
  } catch { message.error('图片导出失败，请稍后重试'); } finally { exporting.value = false; }
}
function money(value: number) { return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value); }
function currencyText(value: number | null) { return value == null ? '—' : `¥${money(value)}`; }
function metricText(value: number | null, unit: string) { if (value == null) return '—'; if (unit === 'CURRENCY') return `¥${money(value)}`; if (unit === 'PERCENT') return `${money(value * 100)}%`; if (unit === 'HOURS') return `${money(value)} 小时`; return money(value); }
function percentText(value: number | null) { return value == null ? '—' : `${money(value * 100)}%`; }
function changeText(value: number | null) { return value == null ? '—' : `${value > 0 ? '+' : ''}${money(value * 100)}%`; }
function changeClass(value: number | null) { return value == null ? '' : value > 0 ? 'positive' : value < 0 ? 'negative' : ''; }
watch([storeId, month, weekDate, periodType], loadReport);
onMounted(async () => { await loadStores(); await loadReport(); });
</script>

<style scoped>
.page-stack { display: grid; gap: 16px; }.section-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }.section-head h1, .report-title h2 { margin: 0; }.section-head p, .report-title p { margin: 6px 0 0; color: #64748b; }.store-select { width: 240px; }.week-select { width: 360px; }
.report-sheet { padding: 22px; border-radius: 14px; background: #f8fafc; color: #0f172a; }.report-title { display: flex; justify-content: space-between; gap: 16px; padding: 0 4px 18px; }.report-meta { display: grid; gap: 6px; text-align: right; color: #64748b; }.report-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }.report-panel { background: white; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }.report-panel h3 { margin: 0; padding: 13px 16px; color: #dc2626; border-bottom: 1px solid #e2e8f0; }.table-wrap { overflow-x: auto; }table { width: 100%; border-collapse: collapse; }th, td { padding: 9px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; white-space: nowrap; }th:first-child, td:first-child { text-align: left; }thead { background: #e0f2fe; }.positive { color: #16a34a; }.negative { color: #dc2626; }.generate-modal { width: min(560px, 90vw); }
@media (max-width: 900px) { .section-head, .report-title { flex-direction: column; }.report-grid { grid-template-columns: 1fr; }.report-meta { text-align: left; }.store-select { width: 100%; } }
</style>
