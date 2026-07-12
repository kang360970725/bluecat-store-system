<template>
  <section class="page-stack">
    <div class="section-head">
      <div>
        <h1>门店排班</h1>
        <p>按日期、班次维护收银、外场、机动岗人员。</p>
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
        <n-button
          v-if="canEdit"
          type="primary"
          :disabled="!dirtyCount"
          :loading="saving"
          @click="saveAll"
        >
          保存排班
        </n-button>
      </n-space>
    </div>

    <div class="schedule-summary-grid">
      <div class="schedule-summary-card">
        <span>当前门店</span>
        <strong>{{ selectedStoreName }}</strong>
        <small>{{ month }}</small>
      </div>
      <div class="schedule-summary-card">
        <span>已安排</span>
        <strong>{{ scheduleSummary.filledCells }}/{{ scheduleSummary.totalCells }}</strong>
        <small>岗位班次</small>
      </div>
      <div class="schedule-summary-card">
        <span>排班天数</span>
        <strong>{{ scheduleSummary.days }}</strong>
        <small>{{ scheduleSummary.shiftRows }} 个班次行</small>
      </div>
      <div class="schedule-summary-card warning">
        <span>待保存</span>
        <strong>{{ dirtyCount }}</strong>
        <small>修改项</small>
      </div>
    </div>

    <div class="wide-table-frame schedule-table-frame">
      <n-data-table
        :columns="columns"
        :data="tableRows"
        :loading="loading"
        :row-class-name="rowClassName"
        :scroll-x="900"
        size="small"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue';
import { NButton, NSelect, NTag, useMessage, type DataTableColumns } from 'naive-ui';
import {
  listSchedules,
  upsertSchedule,
  type ScheduleResult,
  type ScheduleRole
} from '@/api/performance';
import { listStores, type Store } from '@/api/store';
import { useAuthStore } from '@/stores/auth';

type ScheduleTableRow = {
  date: string;
  weekday: string;
  shift: ScheduleResult['shifts'][number];
  dayIndex: number;
  isDayStart: boolean;
  isWeekend: boolean;
  CASHIER?: string;
  FLOOR?: string;
  FLEX?: string;
};

const roleLabels: Record<ScheduleRole, string> = {
  CASHIER: '收银',
  FLOOR: '外场',
  FLEX: '机动岗'
};
const roles: ScheduleRole[] = ['CASHIER', 'FLOOR', 'FLEX'];

const auth = useAuthStore();
const message = useMessage();
const loading = ref(false);
const saving = ref(false);
const stores = ref<Store[]>([]);
const storeId = ref('');
const initialMonth = new Date().toISOString().slice(0, 7);
const month = ref(initialMonth);
const year = ref(Number(initialMonth.slice(0, 4)));
const showMonthPicker = ref(false);
const schedule = ref<ScheduleResult | null>(null);
const draftValues = ref<Record<string, string | null>>({});
const dirtyValues = ref<Record<string, string | null>>({});

const canEdit = computed(
  () =>
    auth.user?.roles.includes('super_admin') ||
    auth.user?.permissions.includes('schedule:update')
);
const storeOptions = computed(() =>
  stores.value.map((store) => ({ label: `${store.name} ${store.code}`, value: store.id }))
);
const selectedStoreName = computed(() => {
  const store = stores.value.find((item) => item.id === storeId.value);
  return store ? `${store.name} ${store.code}` : '-';
});
const employeeOptions = computed(() =>
  schedule.value?.employees.map((employee) => ({
    label: `${employee.name} ${employee.employeeNo}`,
    value: employee.id
  })) ?? []
);
const tableRows = computed<ScheduleTableRow[]>(() => {
  const map = new Map<string, ScheduleTableRow>();
  schedule.value?.rows.forEach((row) => {
    const key = `${row.date}:${row.shift.id}`;
    const cellKey = buildCellKey(row.date, row.shift.id, row.role);
    const existed =
      map.get(key) ??
      ({
        date: row.date,
        weekday: row.weekday,
        shift: row.shift,
        dayIndex: 0,
        isDayStart: false,
        isWeekend: row.weekday === '周六' || row.weekday === '周日'
      } as ScheduleTableRow);
    existed[row.role] = Object.prototype.hasOwnProperty.call(
      draftValues.value,
      cellKey
    )
      ? draftValues.value[cellKey] ?? undefined
      : row.employee.id;
    map.set(key, existed);
  });
  const rows = Array.from(map.values()).sort((left, right) => {
    const dateCompare = left.date.localeCompare(right.date);
    if (dateCompare !== 0) return dateCompare;
    return left.shift.code.localeCompare(right.shift.code);
  });
  const dates = Array.from(new Set(rows.map((row) => row.date)));
  return rows.map((row, index) => ({
    ...row,
    dayIndex: dates.indexOf(row.date),
    isDayStart: index === 0 || rows[index - 1]?.date !== row.date
  }));
});
const dirtyCount = computed(() => Object.keys(dirtyValues.value).length);
const scheduleSummary = computed(() => {
  const totalCells = tableRows.value.length * roles.length;
  const filledCells = tableRows.value.reduce(
    (sum, row) => sum + roles.filter((role) => Boolean(row[role])).length,
    0
  );
  return {
    days: new Set(tableRows.value.map((row) => row.date)).size,
    shiftRows: tableRows.value.length,
    totalCells,
    filledCells
  };
});
const monthItems = Array.from({ length: 12 }, (_, index) => ({
  label: `${index + 1}月`,
  value: index + 1
}));

const columns: DataTableColumns<ScheduleTableRow> = [
  {
    title: '日期',
    key: 'date',
    fixed: 'left',
    width: 116,
    render: (row) =>
      h('div', { class: 'schedule-date-cell' }, [
        h('strong', row.date.slice(8)),
        h('span', row.weekday),
        row.isWeekend ? h(NTag, { size: 'small', type: 'warning' }, () => '周末') : null
      ])
  },
  {
    title: '班次',
    key: 'shift',
    fixed: 'left',
    width: 106,
    render: (row) =>
      h(
        NTag,
        { type: row.shift.code === 'night' ? 'warning' : 'info', round: true },
        () => row.shift.name
      )
  },
  ...roles.map((role) => ({
    title: roleLabels[role],
    key: role,
    width: 210,
    render: (row: ScheduleTableRow) =>
      h('div', { class: ['schedule-select-cell', isCellDirty(row, role) ? 'dirty' : ''] }, [
        h(NSelect, {
          value: row[role],
          options: employeeOptions.value,
          disabled: !canEdit.value,
          filterable: true,
          clearable: true,
          size: 'small',
          placeholder: `选择${roleLabels[role]}`,
          'onUpdate:value': (value: string | null) => updateCell(row, role, value)
        }),
        isCellDirty(row, role) ? h('i', { title: '未保存' }) : null
      ])
  }))
];

function updateCell(
  row: ScheduleTableRow,
  role: ScheduleRole,
  employeeId: string | null
) {
  const key = buildCellKey(row.date, row.shift.id, role);
  draftValues.value = {
    ...draftValues.value,
    [key]: employeeId
  };
  dirtyValues.value = {
    ...dirtyValues.value,
    [key]: employeeId
  };
}

async function saveAll() {
  const entries = Object.entries(dirtyValues.value);
  if (!entries.length) return;

  saving.value = true;
  try {
    await Promise.all(
      entries.map(([key, employeeId]) => {
        const [workDate, shiftId, role] = key.split(':') as [
          string,
          string,
          ScheduleRole
        ];
        return upsertSchedule({
          storeId: storeId.value,
          workDate,
          shiftId,
          role,
          employeeId
        });
      })
    );
    message.success('排班已保存');
    dirtyValues.value = {};
    await load();
  } finally {
    saving.value = false;
  }
}

async function load() {
  if (!storeId.value) return;
  loading.value = true;
  try {
    schedule.value = await listSchedules(storeId.value, month.value);
    draftValues.value = buildDraftValues(schedule.value);
    dirtyValues.value = {};
  } finally {
    loading.value = false;
  }
}

function buildCellKey(date: string, shiftId: string, role: ScheduleRole) {
  return `${date}:${shiftId}:${role}`;
}

function isCellDirty(row: ScheduleTableRow, role: ScheduleRole) {
  return Object.prototype.hasOwnProperty.call(
    dirtyValues.value,
    buildCellKey(row.date, row.shift.id, role)
  );
}

function rowClassName(row: ScheduleTableRow) {
  return [
    'schedule-table-row',
    row.dayIndex % 2 === 0 ? 'schedule-day-even' : 'schedule-day-odd',
    row.isDayStart ? 'schedule-day-start' : '',
    row.isWeekend ? 'schedule-weekend' : '',
    row.shift.code === 'night' ? 'schedule-night-row' : 'schedule-day-row'
  ]
    .filter(Boolean)
    .join(' ');
}

function buildDraftValues(rows: ScheduleResult | null) {
  const values: Record<string, string | null> = {};
  rows?.rows.forEach((row) => {
    values[buildCellKey(row.date, row.shift.id, row.role)] = row.employee.id;
  });
  return values;
}

function buildMonth(yearValue: number, monthValue: number) {
  return `${yearValue}-${String(monthValue).padStart(2, '0')}`;
}

function selectMonth(monthValue: number) {
  month.value = buildMonth(year.value, monthValue);
  showMonthPicker.value = false;
  void load();
}

async function init() {
  stores.value = await listStores();
  storeId.value = stores.value[0]?.id || '';
  await load();
}

onMounted(init);
</script>
