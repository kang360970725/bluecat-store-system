<template>
  <section class="page-stack performance-page">
    <div class="section-head">
      <div>
        <h1>门店业绩指标</h1>
        <p>维护月业绩目标和成本，实际与预估达成由数据同步维度统计。</p>
      </div>
      <n-space align="center">
        <n-popover v-model:show="showQueryMonthPicker" trigger="click" placement="bottom-end">
          <template #trigger>
            <n-button secondary class="month-panel-trigger">{{ month }}</n-button>
          </template>
          <div class="month-panel">
            <div class="month-panel-head">
              <n-button size="small" quaternary @click="queryYear -= 1">上一年</n-button>
              <strong>{{ queryYear }}</strong>
              <n-button size="small" quaternary @click="queryYear += 1">下一年</n-button>
            </div>
            <div class="month-panel-grid">
              <n-button
                v-for="monthItem in monthItems"
                :key="monthItem.value"
                size="small"
                :type="month === buildMonth(queryYear, monthItem.value) ? 'primary' : 'default'"
                @click="selectQueryMonth(monthItem.value)"
              >
                {{ monthItem.label }}
              </n-button>
            </div>
          </div>
        </n-popover>
        <n-button secondary @click="load">查询</n-button>
        <n-button type="primary" @click="openCreate">新增规划</n-button>
      </n-space>
    </div>

    <div class="metric-strip">
      <div>
        <span>数据截止日期</span>
        <strong>{{ result?.dataDeadline || '-' }}</strong>
      </div>
      <div>
        <span>目标总额</span>
        <strong>{{ money(result?.summary.targetRevenue) }}</strong>
      </div>
      <div>
        <span>实际达成</span>
        <strong>{{ money(result?.summary.actualRevenue) }}</strong>
      </div>
      <div>
        <span>当前进度</span>
        <strong>{{ percent(result?.summary.currentProgress) }}</strong>
      </div>
      <div>
        <span>毛利润</span>
        <strong>{{ money(result?.summary.grossProfit) }}</strong>
      </div>
    </div>

    <div class="wide-table-frame">
      <n-data-table
        :columns="columns"
        :data="rows"
        :loading="loading"
        :scroll-x="2320"
        size="small"
      />
    </div>

    <n-modal
      v-model:show="showModal"
      preset="card"
      title="业绩指标"
      class="performance-edit-modal"
    >
      <div class="performance-editor">
        <div class="editor-hero">
          <div>
            <span>{{ editingStoreName }}</span>
            <strong>{{ month }}</strong>
          </div>
          <div>
            <span>总成本</span>
            <strong>{{ money(formTotalCost) }}</strong>
          </div>
          <div>
            <span>成本占比</span>
            <strong>{{ percent(formCostRatio) }}</strong>
          </div>
          <div>
            <span>毛利润</span>
            <strong>{{ money(formGrossProfit) }}</strong>
          </div>
        </div>

        <n-form :model="form" label-placement="top">
          <div v-if="modalMode === 'create'" class="create-plan-panel">
            <n-grid :cols="2" :x-gap="14" responsive="screen">
              <n-form-item-gi label="门店">
                <n-select
                  v-model:value="editingStoreId"
                  :options="storeOptions"
                  @update:value="handleCreateStoreChange"
                />
              </n-form-item-gi>
              <n-form-item-gi label="规划月份">
                <n-popover
                  v-model:show="showFormMonthPicker"
                  trigger="click"
                  placement="bottom-start"
                >
                  <template #trigger>
                    <n-button secondary class="full month-panel-trigger">
                      {{ formMonth }}
                    </n-button>
                  </template>
                  <div class="month-panel">
                    <div class="month-panel-head">
                      <n-button size="small" quaternary @click="formYear -= 1">上一年</n-button>
                      <strong>{{ formYear }}</strong>
                      <n-button size="small" quaternary @click="formYear += 1">下一年</n-button>
                    </div>
                    <div class="month-panel-grid">
                      <n-button
                        v-for="monthItem in monthItems"
                        :key="monthItem.value"
                        size="small"
                        :disabled="isCreateMonthDisabled(buildMonth(formYear, monthItem.value))"
                        :type="
                          formMonth === buildMonth(formYear, monthItem.value)
                            ? 'primary'
                            : 'default'
                        "
                        @click="selectFormMonth(monthItem.value)"
                      >
                        {{ monthItem.label }}
                      </n-button>
                    </div>
                  </div>
                </n-popover>
              </n-form-item-gi>
            </n-grid>
          </div>

          <div class="target-panel">
            <n-form-item label="月业绩目标">
              <n-input-number
                v-model:value="form.targetRevenue"
                :min="0"
                class="full target-input"
              />
            </n-form-item>
            <n-grid :cols="2" :x-gap="14" responsive="screen">
              <n-form-item-gi label="网费目标">
                <n-input-number v-model:value="form.netFeeTarget" :min="0" class="full" />
              </n-form-item-gi>
              <n-form-item-gi label="商品目标">
                <n-input-number v-model:value="form.productTarget" :min="0" class="full" />
              </n-form-item-gi>
            </n-grid>
          </div>

          <div class="cost-section" v-for="group in costGroups" :key="group.title">
            <div class="cost-section-head">
              <h3>{{ group.title }}</h3>
              <span>{{ money(groupTotal(group.fields)) }}</span>
            </div>
            <n-grid :cols="3" :x-gap="14" :y-gap="4" responsive="screen">
              <n-form-item-gi
                v-for="field in group.fields"
                :key="field.key"
                :label="field.label"
              >
                <n-input-number v-model:value="form[field.key]" :min="0" class="full" />
              </n-form-item-gi>
            </n-grid>
          </div>
        </n-form>
      </div>
      <template #footer>
        <n-space justify="space-between">
          <n-button :loading="copying" @click="copyCosts">沿用上一月成本</n-button>
          <n-space>
            <n-button @click="showModal = false">取消</n-button>
            <n-button type="primary" :loading="saving" @click="save">保存</n-button>
          </n-space>
        </n-space>
      </template>
    </n-modal>

    <n-drawer
      v-model:show="showSplitDrawer"
      :width="splitDrawerWidth"
      placement="right"
      class="performance-split-drawer"
    >
      <n-drawer-content
        :title="splitDrawerTitle"
        closable
        body-content-class="performance-split-drawer-body"
      >
        <div class="split-drawer-resizer" @mousedown="startSplitDrawerResize" />
        <div v-if="drawerSplit" class="split-drawer-progress">
          <div>
            <span>拆分总目标</span>
            <strong>{{ money(splitTotalTarget) }}</strong>
          </div>
          <div>
            <span>拆分完成率</span>
            <strong>{{ percent(drawerTotalCompletionRate) }}</strong>
            <n-progress
              type="line"
              :percentage="progressValue(drawerTotalCompletionRate)"
              :show-indicator="false"
              :status="drawerTotalCompletionRate >= 100 ? 'success' : 'default'"
            />
          </div>
          <div>
            <span>已达成合计</span>
            <strong>{{ money(splitTotalActual) }}</strong>
          </div>
          <div>
            <span>剩余目标</span>
            <strong>{{ money(splitRemainingTarget) }}</strong>
          </div>
        </div>

        <div v-if="drawerSplit" class="metric-strip compact">
          <div>
            <span>网费目标</span>
            <strong>{{ money(drawerSplit.summary.netFeeTarget) }}</strong>
          </div>
          <div>
            <span>网费达成</span>
            <strong>{{ money(drawerSplit.summary.netFeeActual) }}</strong>
          </div>
          <div>
            <span>商品目标</span>
            <strong>{{ money(drawerSplit.summary.productTarget) }}</strong>
          </div>
          <div>
            <span>商品达成</span>
            <strong>{{ money(drawerSplit.summary.productActual) }}</strong>
          </div>
          <div>
            <span>总达成率</span>
            <strong>{{ percent(drawerTotalCompletionRate) }}</strong>
          </div>
        </div>

        <div class="split-drawer-actions">
          <n-button secondary :loading="splitLoading" @click="reloadDrawerSplit">刷新拆分表</n-button>
          <n-popconfirm
            v-if="drawerRow?.targetId && canUpdateSplit"
            positive-text="确认重拆分"
            negative-text="取消"
            @positive-click="generateSplit(drawerRow, true)"
          >
            <template #trigger>
              <n-button type="warning" secondary :loading="splitGenerating">
                {{ drawerRow.splitStatus === 'ACTIVE' ? '重拆分' : '生成拆分' }}
              </n-button>
            </template>
            将按当前业绩指标中的网费目标、商品目标重新生成默认拆分，已有手工调整会被默认数据覆盖。请确认。
          </n-popconfirm>
        </div>

        <div class="wide-table-frame split-table-frame">
          <n-data-table
            :columns="splitColumns"
            :data="drawerSplit?.rows || []"
            :loading="splitLoading"
            :max-height="splitTableMaxHeight"
            :row-class-name="splitRowClassName"
            :scroll-x="1680"
            size="small"
          />
        </div>
      </n-drawer-content>
    </n-drawer>

    <n-modal
      v-model:show="showSplitEditModal"
      preset="card"
      title="修改拆分目标"
      class="edit-modal"
    >
      <n-form :model="splitForm" label-placement="top">
        <n-form-item label="网费目标">
          <n-input-number v-model:value="splitForm.netFeeTarget" :min="0" class="full" />
        </n-form-item>
        <n-form-item label="商品目标">
          <n-input-number v-model:value="splitForm.productTarget" :min="0" class="full" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showSplitEditModal = false">取消</n-button>
          <n-button type="primary" :loading="splitSaving" @click="saveSplitItem">
            保存
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </section>
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { NButton, NPopconfirm, NTag, useMessage, type DataTableColumns } from 'naive-ui';
import {
  copyPreviousMonthCosts,
  createPerformanceTarget,
  generatePerformanceSplit,
  getPerformanceSplit,
  listPerformanceExistingMonths,
  listMonthlyPerformances,
  updatePerformanceSplitItem,
  updatePerformanceTarget,
  type PerformanceCosts,
  type PerformanceRow,
  type PerformanceTargetPayload,
  type MonthlyPerformanceResult,
  type SplitPlanResult
} from '@/api/performance';
import { useAuthStore } from '@/stores/auth';

const costFields: Array<{ key: keyof PerformanceCosts; label: string }> = [
  { key: 'managementFee', label: '管理费' },
  { key: 'rent', label: '房租' },
  { key: 'propertyTrashFee', label: '物业垃圾费' },
  { key: 'utilities', label: '水电' },
  { key: 'drinkMaterial', label: '饮品材料' },
  { key: 'mealMaterial', label: '餐食材料' },
  { key: 'welfare', label: '福利物品' },
  { key: 'salary', label: '工资' },
  { key: 'franchiseFee', label: '特权' },
  { key: 'baseOperationSoftware', label: '基础运营软件' },
  { key: 'storeOperation', label: '门店运营' },
  { key: 'advertisingMaterial', label: '广告物料' },
  { key: 'financeTax', label: '财务报税' },
  { key: 'withdrawalFee', label: '提现手续费' }
];

const message = useMessage();
const auth = useAuthStore();
const loading = ref(false);
const saving = ref(false);
const copying = ref(false);
const splitLoading = ref(false);
const splitSaving = ref(false);
const splitGenerating = ref(false);
const splitDrawerWidth = ref(1120);
const splitResizeStartX = ref(0);
const splitResizeStartWidth = ref(0);
const showModal = ref(false);
const showSplitDrawer = ref(false);
const showSplitEditModal = ref(false);
const showQueryMonthPicker = ref(false);
const showFormMonthPicker = ref(false);
const modalMode = ref<'create' | 'edit'>('edit');
const editingStoreId = ref('');
const editingStoreName = ref('');
const splitEditingId = ref('');
const initialMonth = new Date().toISOString().slice(0, 7);
const queryMonthValue = ref(initialMonth);
const queryYear = ref(Number(initialMonth.slice(0, 4)));
const formMonthValue = ref(nextMonth(new Date()));
const formYear = ref(Number(formMonthValue.value.slice(0, 4)));
const existingMonths = ref<string[]>([]);
const result = ref<MonthlyPerformanceResult | null>(null);
const drawerRow = ref<PerformanceRow | null>(null);
const drawerSplit = ref<SplitPlanResult | null>(null);

const form = reactive<PerformanceTargetPayload>({
  targetRevenue: 0,
  netFeeTarget: 0,
  productTarget: 0,
  managementFee: 0,
  rent: 0,
  propertyTrashFee: 0,
  utilities: 0,
  drinkMaterial: 0,
  mealMaterial: 0,
  welfare: 0,
  salary: 0,
  franchiseFee: 0,
  baseOperationSoftware: 0,
  storeOperation: 0,
  advertisingMaterial: 0,
  financeTax: 0,
  withdrawalFee: 0
});
const splitForm = reactive({
  netFeeTarget: 0,
  productTarget: 0
});

const rows = computed(() => result.value?.rows ?? []);
const canViewSplit = computed(
  () =>
    auth.user?.roles.includes('super_admin') ||
    auth.user?.permissions.includes('performance-split:view') ||
    auth.user?.permissions.includes('performance-split:update')
);
const canUpdateSplit = computed(
  () =>
    auth.user?.roles.includes('super_admin') ||
    auth.user?.permissions.includes('performance-split:update')
);
const month = computed(() => queryMonthValue.value);
const formMonth = computed(() => formMonthValue.value);
const storeOptions = computed(() =>
  rows.value.map((row) => ({
    label: `${row.store.name} ${row.store.code}`,
    value: row.store.id
  }))
);
const formTotalCost = computed(() =>
  costFields.reduce((sum, field) => sum + Number(form[field.key] || 0), 0)
);
const formCostRatio = computed(() => {
  const targetRevenue = Number(form.targetRevenue || 0);
  return targetRevenue ? (formTotalCost.value / targetRevenue) * 100 : 0;
});
const formGrossProfit = computed(
  () => Number(form.targetRevenue || 0) - formTotalCost.value
);
const splitDrawerTitle = computed(() =>
  drawerRow.value
    ? `${drawerRow.value.store.name} ${drawerRow.value.month} 业绩拆分`
    : '业绩拆分'
);
const drawerTotalCompletionRate = computed(() => {
  return splitTotalTarget.value ? (splitTotalActual.value / splitTotalTarget.value) * 100 : 0;
});
const splitTotalTarget = computed(() => {
  const split = drawerSplit.value;
  return split ? split.summary.netFeeTarget + split.summary.productTarget : 0;
});
const splitTotalActual = computed(() => {
  const split = drawerSplit.value;
  return split ? split.summary.netFeeActual + split.summary.productActual : 0;
});
const splitRemainingTarget = computed(() =>
  Math.max(splitTotalTarget.value - splitTotalActual.value, 0)
);
const splitTableMaxHeight = computed(() => {
  if (typeof window === 'undefined') {
    return 560;
  }
  return Math.max(360, window.innerHeight - 350);
});

const costGroups = [
  {
    title: '固定运营',
    fields: costFields.slice(0, 4)
  },
  {
    title: '物料与福利',
    fields: costFields.slice(4, 7)
  },
  {
    title: '人员与平台',
    fields: costFields.slice(7, 11)
  },
  {
    title: '运营与财税',
    fields: costFields.slice(11)
  }
];
const monthItems = Array.from({ length: 12 }, (_, index) => ({
  label: `${index + 1}月`,
  value: index + 1
}));

const columns: DataTableColumns<PerformanceRow> = [
  {
    title: '门店',
    key: 'store',
    fixed: 'left',
    width: 120,
    sorter: (left, right) => left.store.name.localeCompare(right.store.name, 'zh-CN'),
    render: (row) => row.store.name
  },
  {
    title: '月业绩目标',
    key: 'targetRevenue',
    width: 120,
    sorter: numericSorter('targetRevenue'),
    render: (row) => h('span', { class: 'target-cell' }, money(row.targetRevenue))
  },
  {
    title: '拆分状态',
    key: 'splitStatus',
    width: 110,
    sorter: (left, right) => left.splitStatus.localeCompare(right.splitStatus),
    render: (row) =>
      h(
        NTag,
        { type: row.splitStatus === 'ACTIVE' ? 'success' : 'warning' },
        () => (row.splitStatus === 'ACTIVE' ? '已生效' : '未拆分')
      )
  },
  {
    title: '网费目标',
    key: 'netFeeTarget',
    width: 120,
    sorter: numericSorter('netFeeTarget'),
    render: (row) => money(row.netFeeTarget)
  },
  {
    title: '商品目标',
    key: 'productTarget',
    width: 120,
    sorter: numericSorter('productTarget'),
    render: (row) => money(row.productTarget)
  },
  {
    title: '实际达成',
    key: 'actualRevenue',
    width: 120,
    sorter: numericSorter('actualRevenue'),
    render: (row) => money(row.actualRevenue)
  },
  {
    title: '预估达成',
    key: 'estimatedRevenue',
    width: 120,
    sorter: numericSorter('estimatedRevenue'),
    render: (row) => money(row.estimatedRevenue)
  },
  {
    title: '月达成率',
    key: 'monthlyCompletionRate',
    width: 110,
    sorter: numericSorter('monthlyCompletionRate'),
    render: (row) => percent(row.monthlyCompletionRate)
  },
  {
    title: '当前进度',
    key: 'currentProgress',
    width: 110,
    sorter: numericSorter('currentProgress'),
    render: (row) => percent(row.currentProgress)
  },
  {
    title: '当前排名',
    key: 'rank',
    width: 100,
    sorter: numericSorter('rank'),
    render: (row) => h(NTag, { type: row.rank <= 3 ? 'success' : 'default' }, () => String(row.rank || '-'))
  },
  ...costFields.map((field) => ({
    title: field.label,
    key: field.key,
    width: 110,
    sorter: (left: PerformanceRow, right: PerformanceRow) =>
      left.costs[field.key] - right.costs[field.key],
    render: (row: PerformanceRow) => money(row.costs[field.key])
  })),
  {
    title: '总成本',
    key: 'totalCost',
    width: 120,
    sorter: numericSorter('totalCost'),
    render: (row) => money(row.totalCost)
  },
  {
    title: '成本占比',
    key: 'costRatio',
    width: 110,
    sorter: numericSorter('costRatio'),
    render: (row) => percent(row.costRatio)
  },
  {
    title: '毛利润',
    key: 'grossProfit',
    width: 120,
    sorter: numericSorter('grossProfit'),
    render: (row) => money(row.grossProfit)
  },
  {
    title: '操作',
    key: 'actions',
    fixed: 'right',
    width: 220,
    render: (row) => {
      const actions = [
        row.editable
          ? h(NButton, { size: 'small', onClick: () => openEdit(row) }, () => '编辑')
          : null,
        canViewSplit.value && row.targetId && row.splitStatus === 'ACTIVE'
          ? h(
              NButton,
              { size: 'small', secondary: true, onClick: () => openSplitDrawer(row) },
              () => '拆分表'
            )
          : null,
        canUpdateSplit.value && row.targetId
          ? h(
              NPopconfirm,
              {
                positiveText: row.splitStatus === 'ACTIVE' ? '确认重拆分' : '确认生成',
                negativeText: '取消',
                onPositiveClick: () => generateSplit(row)
              },
              {
                trigger: () =>
                  h(
                    NButton,
                    { size: 'small', secondary: true, type: row.splitStatus === 'ACTIVE' ? 'warning' : 'primary' },
                    () => (row.splitStatus === 'ACTIVE' ? '重拆分' : '拆分')
                  ),
                default: () =>
                  '将按当前业绩指标中的网费目标、商品目标重新生成默认拆分，已有手工调整会被默认数据覆盖。请确认。'
              }
            )
          : null
      ].filter(Boolean);
      return h('div', { class: 'table-actions' }, actions);
    }
  }
];

type SplitRow = SplitPlanResult['rows'][number];

const splitColumns: DataTableColumns<SplitRow> = [
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
    render: (row) =>
      h(
        NTag,
        { type: row.totalCompletionRate >= 100 ? 'success' : 'warning' },
        () => percent(row.totalCompletionRate)
      )
  },
  {
    title: '操作',
    key: 'actions',
    fixed: 'right',
    width: 90,
    render: (row) =>
      canUpdateSplit.value
        ? h(NButton, { size: 'small', onClick: () => openSplitEdit(row) }, () => '编辑')
        : '-'
  }
];

function openEdit(row: PerformanceRow) {
  modalMode.value = 'edit';
  editingStoreId.value = row.store.id;
  editingStoreName.value = row.store.name;
  formMonthValue.value = row.month;
  formYear.value = Number(row.month.slice(0, 4));
  Object.assign(form, {
    targetRevenue: row.targetRevenue,
    netFeeTarget: row.netFeeTarget,
    productTarget: row.productTarget,
    ...row.costs
  });
  showModal.value = true;
}

async function openCreate() {
  modalMode.value = 'create';
  resetForm();
  editingStoreId.value = rows.value[0]?.store.id || '';
  editingStoreName.value = rows.value[0]?.store.name || '';
  formMonthValue.value = nextMonth(new Date());
  formYear.value = Number(formMonthValue.value.slice(0, 4));
  if (editingStoreId.value) {
    await loadExistingMonths(editingStoreId.value);
    ensureCreateMonthAvailable();
  }
  showModal.value = true;
}

async function save() {
  saving.value = true;
  try {
    if (modalMode.value === 'create') {
      await createPerformanceTarget({
        ...form,
        storeId: editingStoreId.value,
        month: formMonth.value
      });
      queryMonthValue.value = formMonthValue.value;
      queryYear.value = Number(queryMonthValue.value.slice(0, 4));
    } else {
      await updatePerformanceTarget(editingStoreId.value, month.value, form);
    }
    message.success('保存成功');
    showModal.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

async function copyCosts() {
  copying.value = true;
  try {
    const costs = await copyPreviousMonthCosts(
      editingStoreId.value,
      modalMode.value === 'create' ? formMonth.value : month.value
    );
    Object.assign(form, costs);
    message.success('已代入上一月成本，可继续修改后保存');
  } finally {
    copying.value = false;
  }
}

function numericSorter(key: keyof PerformanceRow) {
  return (left: PerformanceRow, right: PerformanceRow) =>
    Number(left[key] || 0) - Number(right[key] || 0);
}

function groupTotal(fields: typeof costFields) {
  return fields.reduce((sum, field) => sum + Number(form[field.key] || 0), 0);
}

async function load() {
  loading.value = true;
  try {
    result.value = await listMonthlyPerformances(month.value);
    if (drawerRow.value) {
      const latestRow = rows.value.find(
        (row) => row.store.id === drawerRow.value?.store.id
      );
      drawerRow.value = latestRow ?? drawerRow.value;
    }
  } finally {
    loading.value = false;
  }
}

async function handleCreateStoreChange(storeId: string | null) {
  if (!storeId) {
    return;
  }
  editingStoreName.value =
    rows.value.find((row) => row.store.id === storeId)?.store.name || '';
  await loadExistingMonths(storeId);
  ensureCreateMonthAvailable();
}

async function loadExistingMonths(storeId: string) {
  existingMonths.value = await listPerformanceExistingMonths(storeId);
}

function ensureCreateMonthAvailable() {
  if (!existingMonths.value.includes(formMonth.value)) {
    return;
  }
  const base = new Date(`${formMonth.value}-01T00:00:00.000Z`);
  for (let index = 0; index < 24; index += 1) {
    base.setMonth(base.getMonth() + 1);
    const candidate = base.toISOString().slice(0, 7);
    if (!existingMonths.value.includes(candidate)) {
      formMonthValue.value = candidate;
      formYear.value = Number(candidate.slice(0, 4));
      return;
    }
  }
}

function isCreateMonthDisabled(value: string) {
  return existingMonths.value.includes(value);
}

function resetForm() {
  Object.assign(form, {
    targetRevenue: 0,
    netFeeTarget: 0,
    productTarget: 0,
    managementFee: 0,
    rent: 0,
    propertyTrashFee: 0,
    utilities: 0,
    drinkMaterial: 0,
    mealMaterial: 0,
    welfare: 0,
    salary: 0,
    franchiseFee: 0,
    baseOperationSoftware: 0,
    storeOperation: 0,
    advertisingMaterial: 0,
    financeTax: 0,
    withdrawalFee: 0
  });
}

async function generateSplit(row: PerformanceRow, keepDrawerOpen = false) {
  if (!row.targetId) {
    return;
  }
  splitGenerating.value = true;
  try {
    await generatePerformanceSplit(row.targetId, {
      netFeeTarget: row.netFeeTarget,
      productTarget: row.productTarget,
      weekendIncreaseRate: 0.15
    });
    message.success(row.splitStatus === 'ACTIVE' ? '业绩拆分已重置' : '业绩拆分已生成，指标已生效');
    await load();
    if (keepDrawerOpen || showSplitDrawer.value) {
      const latestRow = rows.value.find((item) => item.store.id === row.store.id) ?? row;
      drawerRow.value = latestRow;
      await loadDrawerSplit(latestRow);
    }
  } finally {
    splitGenerating.value = false;
  }
}

async function openSplitDrawer(row: PerformanceRow) {
  drawerRow.value = row;
  splitDrawerWidth.value = getDefaultSplitDrawerWidth();
  showSplitDrawer.value = true;
  await loadDrawerSplit(row);
}

async function reloadDrawerSplit() {
  if (!drawerRow.value) {
    return;
  }
  await loadDrawerSplit(drawerRow.value);
}

async function loadDrawerSplit(row: PerformanceRow) {
  splitLoading.value = true;
  try {
    drawerSplit.value = await getPerformanceSplit(row.store.id, row.month);
  } finally {
    splitLoading.value = false;
  }
}

function openSplitEdit(row: SplitRow) {
  splitEditingId.value = row.id;
  splitForm.netFeeTarget = row.netFeeTarget;
  splitForm.productTarget = row.productTarget;
  showSplitEditModal.value = true;
}

async function saveSplitItem() {
  splitSaving.value = true;
  try {
    await updatePerformanceSplitItem(splitEditingId.value, splitForm);
    message.success('拆分目标已保存');
    showSplitEditModal.value = false;
    await reloadDrawerSplit();
    await load();
  } finally {
    splitSaving.value = false;
  }
}

function splitRowClassName(row: SplitRow) {
  const rows = drawerSplit.value?.rows ?? [];
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

function money(value?: number) {
  return Number(value || 0).toLocaleString('zh-CN', {
    maximumFractionDigits: 0
  });
}

function percent(value?: number) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function progressValue(value?: number) {
  return Math.min(100, Math.max(0, Number(value || 0)));
}

function getDefaultSplitDrawerWidth() {
  if (typeof window === 'undefined') {
    return 1120;
  }
  return Math.round(Math.min(1280, Math.max(960, window.innerWidth * 0.82)));
}

function startSplitDrawerResize(event: MouseEvent) {
  splitResizeStartX.value = event.clientX;
  splitResizeStartWidth.value = splitDrawerWidth.value;
  window.addEventListener('mousemove', handleSplitDrawerResize);
  window.addEventListener('mouseup', stopSplitDrawerResize);
}

function handleSplitDrawerResize(event: MouseEvent) {
  const nextWidth =
    splitResizeStartWidth.value + (splitResizeStartX.value - event.clientX);
  const maxWidth =
    typeof window === 'undefined' ? 1400 : Math.max(720, window.innerWidth - 48);
  splitDrawerWidth.value = Math.min(maxWidth, Math.max(720, nextWidth));
}

function stopSplitDrawerResize() {
  window.removeEventListener('mousemove', handleSplitDrawerResize);
  window.removeEventListener('mouseup', stopSplitDrawerResize);
}

function buildMonth(year: number, monthValue: number) {
  return `${year}-${String(monthValue).padStart(2, '0')}`;
}

function selectQueryMonth(monthValue: number) {
  queryMonthValue.value = buildMonth(queryYear.value, monthValue);
  showQueryMonthPicker.value = false;
  void load();
}

function selectFormMonth(monthValue: number) {
  const value = buildMonth(formYear.value, monthValue);
  if (isCreateMonthDisabled(value)) {
    return;
  }
  formMonthValue.value = value;
  showFormMonthPicker.value = false;
}

function nextMonth(value: Date) {
  const date = new Date(Date.UTC(value.getFullYear(), value.getMonth(), 1));
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().slice(0, 7);
}

onMounted(load);
onBeforeUnmount(stopSplitDrawerResize);
</script>
