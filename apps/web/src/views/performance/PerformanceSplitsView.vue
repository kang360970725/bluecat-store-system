<template>
  <section class="page-stack">
    <div class="section-head">
      <div>
        <h1>业绩拆分表</h1>
        <p>按日期、班次查看和维护网费目标、商品目标及实时达成。</p>
      </div>
      <n-space align="center">
        <n-select v-model:value="storeId" :options="storeOptions" class="filter-select" />
        <n-popover v-model:show="showMonthPicker" trigger="click" placement="bottom-end">
          <template #trigger>
            <n-button secondary class="month-panel-trigger">{{ month }}</n-button>
          </template>
          <div class="month-panel">
            <div class="month-panel-head">
              <n-button size="small" quaternary @click="year -= 1">上一年</n-button>
              <strong>{{ year }}</strong>
              <n-button size="small" quaternary @click="year += 1">下一年</n-button>
            </div>
            <div class="month-panel-grid">
              <n-button
                v-for="monthItem in monthItems"
                :key="monthItem.value"
                size="small"
                :type="month === buildMonth(year, monthItem.value) ? 'primary' : 'default'"
                @click="selectMonth(monthItem.value)"
              >
                {{ monthItem.label }}
              </n-button>
            </div>
          </div>
        </n-popover>
        <n-button secondary :loading="loading" @click="load">查询</n-button>
      </n-space>
    </div>

    <div v-if="split" class="metric-strip">
      <div>
        <span>门店</span>
        <strong>{{ split.store.name }}</strong>
      </div>
      <div>
        <span>网费目标</span>
        <strong>{{ money(split.summary.netFeeTarget) }}</strong>
      </div>
      <div>
        <span>商品目标</span>
        <strong>{{ money(split.summary.productTarget) }}</strong>
      </div>
      <div>
        <span>网费达成</span>
        <strong>{{ money(split.summary.netFeeActual) }}</strong>
      </div>
      <div>
        <span>商品达成</span>
        <strong>{{ money(split.summary.productActual) }}</strong>
      </div>
    </div>

    <div class="wide-table-frame split-table-frame">
      <n-data-table
        :columns="columns"
        :data="split?.rows || []"
        :loading="loading"
        :row-class-name="rowClassName"
        :scroll-x="1680"
        size="small"
      />
    </div>

    <n-modal v-model:show="showModal" preset="card" title="修改拆分目标" class="edit-modal">
      <n-form :model="form" label-placement="top">
        <n-form-item label="网费目标">
          <n-input-number v-model:value="form.netFeeTarget" :min="0" class="full" />
        </n-form-item>
        <n-form-item label="商品目标">
          <n-input-number v-model:value="form.productTarget" :min="0" class="full" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="save">保存</n-button>
        </n-space>
      </template>
    </n-modal>
  </section>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { NButton, NTag, useMessage, type DataTableColumns } from 'naive-ui';
import {
  getPerformanceSplit,
  updatePerformanceSplitItem,
  type SplitPlanResult
} from '@/api/performance';
import { listStores, type Store } from '@/api/store';
import { useAuthStore } from '@/stores/auth';

type SplitRow = SplitPlanResult['rows'][number];

const auth = useAuthStore();
const message = useMessage();
const loading = ref(false);
const saving = ref(false);
const showModal = ref(false);
const editingId = ref('');
const stores = ref<Store[]>([]);
const storeId = ref('');
const initialMonth = new Date().toISOString().slice(0, 7);
const month = ref(initialMonth);
const year = ref(Number(initialMonth.slice(0, 4)));
const showMonthPicker = ref(false);
const split = ref<SplitPlanResult | null>(null);

const form = reactive({
  netFeeTarget: 0,
  productTarget: 0
});

const storeOptions = computedStoreOptions();
const monthItems = Array.from({ length: 12 }, (_, index) => ({
  label: `${index + 1}月`,
  value: index + 1
}));
const canEdit = () =>
  auth.user?.roles.includes('super_admin') ||
  auth.user?.permissions.includes('performance-split:update');

const columns: DataTableColumns<SplitRow> = [
  {
    title: '日期',
    key: 'date',
    fixed: 'left',
    width: 96,
    render: (row) => h('span', { class: 'split-date-text' }, row.date.slice(5))
  },
  { title: '星期', key: 'weekday', width: 70 },
  {
    title: '班次',
    key: 'shift',
    width: 82,
    render: (row) =>
      h(
        NTag,
        {
          size: 'small',
          type: row.shift.code === 'night' ? 'warning' : 'info',
          bordered: false
        },
        () => row.shift.name
      )
  },
  { title: '收银', key: 'cashier', width: 110, render: (row) => row.staff.cashier?.name || '-' },
  { title: '外场', key: 'floor', width: 110, render: (row) => row.staff.floor?.name || '-' },
  { title: '机动岗', key: 'flex', width: 110, render: (row) => row.staff.flex?.name || '-' },
  { title: '网费目标', key: 'netFeeTarget', width: 110, sorter: 'default', render: (row) => money(row.netFeeTarget) },
  { title: '商品目标', key: 'productTarget', width: 110, sorter: 'default', render: (row) => money(row.productTarget) },
  { title: '网费达成', key: 'netFeeActual', width: 110, sorter: 'default', render: (row) => money(row.netFeeActual) },
  { title: '商品达成', key: 'productActual', width: 110, sorter: 'default', render: (row) => money(row.productActual) },
  { title: '网费达成率', key: 'netFeeCompletionRate', width: 120, render: (row) => percent(row.netFeeCompletionRate) },
  { title: '商品达成率', key: 'productCompletionRate', width: 120, render: (row) => percent(row.productCompletionRate) },
  { title: '总目标', key: 'totalTarget', width: 110, render: (row) => money(row.totalTarget) },
  {
    title: '总达成率',
    key: 'totalCompletionRate',
    width: 110,
    render: (row) => h(NTag, { type: row.totalCompletionRate >= 100 ? 'success' : 'warning' }, () => percent(row.totalCompletionRate))
  },
  {
    title: '操作',
    key: 'actions',
    fixed: 'right',
    width: 90,
    render: (row) =>
      canEdit()
        ? h(NButton, { size: 'small', onClick: () => openEdit(row) }, () => '编辑')
        : '-'
  }
];

function computedStoreOptions() {
  return computed(() =>
    stores.value.map((store) => ({ label: `${store.name} ${store.code}`, value: store.id }))
  );
}

function openEdit(row: SplitRow) {
  editingId.value = row.id;
  form.netFeeTarget = row.netFeeTarget;
  form.productTarget = row.productTarget;
  showModal.value = true;
}

async function save() {
  saving.value = true;
  try {
    await updatePerformanceSplitItem(editingId.value, form);
    message.success('保存成功');
    showModal.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

async function load() {
  if (!storeId.value) return;
  loading.value = true;
  try {
    split.value = await getPerformanceSplit(storeId.value, month.value);
  } finally {
    loading.value = false;
  }
}

async function init() {
  stores.value = await listStores();
  storeId.value = stores.value[0]?.id || '';
  await load();
}

function money(value?: number) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

function percent(value?: number) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function rowClassName(row: SplitRow) {
  const rows = split.value?.rows ?? [];
  const firstDateIndex = rows.findIndex((item) => item.date === row.date);
  const rowIndex = rows.findIndex((item) => item.id === row.id);
  const dayIndex = Array.from(new Set(rows.map((item) => item.date))).findIndex(
    (date) => date === row.date
  );
  return [
    'split-table-row',
    dayIndex % 2 === 0 ? 'split-day-even' : 'split-day-odd',
    firstDateIndex === rowIndex ? 'split-day-start' : '',
    row.weekday === '周六' || row.weekday === '周日' ? 'split-weekend' : '',
    row.shift.code === 'night' ? 'split-night-row' : 'split-day-row'
  ]
    .filter(Boolean)
    .join(' ');
}

function buildMonth(yearValue: number, monthValue: number) {
  return `${yearValue}-${String(monthValue).padStart(2, '0')}`;
}

function selectMonth(monthValue: number) {
  month.value = buildMonth(year.value, monthValue);
  showMonthPicker.value = false;
  void load();
}

onMounted(init);
</script>
