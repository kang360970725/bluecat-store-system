<template>
  <section class="page-stack">
    <div class="section-head">
      <div>
        <h1>门店评分</h1>
        <p>按月录入门店评比维度得分，公式规则后续接入。</p>
      </div>
      <n-space align="center">
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

    <div class="score-dimension-grid">
      <button
        v-for="group in dimensionGroups"
        :key="group.code"
        class="score-dimension-card"
        :class="{ active: activeDimension === group.code }"
        type="button"
        @click="activeDimension = group.code"
      >
        <span class="score-dimension-name">{{ group.name }}</span>
        <ol v-if="buildTopStores(group).length" class="score-top-list">
          <li v-for="store in buildTopStores(group)" :key="store.store.id">
            <em>{{ store.dimensionRank }}</em>
            <strong>{{ store.store.name || store.store.code || '-' }}</strong>
          </li>
        </ol>
        <small v-else>暂无排名数据</small>
      </button>
    </div>

    <n-tabs v-model:value="activeDimension" type="line" animated>
      <n-tab-pane
        v-for="group in dimensionGroups"
        :key="group.code"
        :name="group.code"
        :tab="group.name"
      >
        <div class="score-dimension-panel">
          <div class="score-dimension-head">
            <div>
              <h2>{{ group.name }}</h2>
              <p>本维度共 {{ group.items.length }} 个计分项目，排名按该维度合计得分计算。</p>
            </div>
            <n-tag type="info" round>独立维度排名</n-tag>
          </div>
          <div class="wide-table-frame scoring-table-frame">
            <n-data-table
              :columns="buildColumns(group)"
              :data="buildRows(group)"
              :loading="loading"
              :scroll-x="Math.max(920, 300 + group.items.length * 128)"
              size="small"
            />
          </div>
        </div>
      </n-tab-pane>
    </n-tabs>

    <n-modal v-model:show="showModal" preset="card" title="录入评分" class="edit-modal">
      <n-form :model="form" label-placement="top">
        <n-alert type="info" class="score-item-info">
          {{ editingItem?.categoryName }} / {{ editingItem?.name }}
          <span v-if="editingItem?.maxScore !== null">，上限 {{ scoreLimit(editingItem?.maxScore) }}</span>
        </n-alert>
        <n-form-item label="原始值">
          <n-input-number v-model:value="form.rawValue" class="full" />
        </n-form-item>
        <n-form-item label="得分">
          <n-input-number v-model:value="form.score" class="full" />
        </n-form-item>
        <n-form-item label="备注">
          <n-input v-model:value="form.remark" />
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
import { computed, h, onMounted, reactive, ref, watch } from 'vue';
import { NButton, NTag, useMessage, type DataTableColumns } from 'naive-ui';
import {
  listMonthlyScoring,
  upsertScoreEntry,
  type ScoreItem,
  type StoreScoreRow
} from '@/api/scoring';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const message = useMessage();
const loading = ref(false);
const saving = ref(false);
const showModal = ref(false);
const showMonthPicker = ref(false);
const initialMonth = new Date().toISOString().slice(0, 7);
const month = ref(initialMonth);
const year = ref(Number(initialMonth.slice(0, 4)));
const items = ref<ScoreItem[]>([]);
const rows = ref<StoreScoreRow[]>([]);
const editingStoreId = ref('');
const editingItem = ref<ScoreItem | null>(null);
const activeDimension = ref('');

const form = reactive({
  rawValue: 0 as number | null,
  score: 0,
  remark: ''
});

const monthItems = Array.from({ length: 12 }, (_, index) => ({
  label: `${index + 1}月`,
  value: index + 1
}));
const canEdit = computed(
  () =>
    auth.user?.roles.includes('super_admin') ||
    auth.user?.permissions.includes('scoring:update')
);

type ScoreDimensionGroup = {
  code: string;
  name: string;
  items: ScoreItem[];
};

type DimensionScoreRow = StoreScoreRow & {
  dimensionScore: number;
  dimensionRank: number;
};

const dimensionGroups = computed<ScoreDimensionGroup[]>(() => {
  const groupMap = new Map<string, ScoreDimensionGroup>();
  items.value.forEach((item) => {
    const group = groupMap.get(item.categoryCode);
    if (group) {
      group.items.push(item);
      return;
    }
    groupMap.set(item.categoryCode, {
      code: item.categoryCode,
      name: item.categoryName,
      items: [item]
    });
  });
  return Array.from(groupMap.values());
});

function buildColumns(group: ScoreDimensionGroup): DataTableColumns<DimensionScoreRow> {
  return [
    {
      title: '排名',
      key: 'dimensionRank',
      fixed: 'left',
      width: 72,
      sorter: 'default',
      render: (row) =>
        h(
          NTag,
          { type: row.dimensionRank <= 3 ? 'warning' : 'default', round: true },
          () => `#${row.dimensionRank}`
        )
    },
    {
      title: '门店',
      key: 'store',
      fixed: 'left',
      width: 150,
      render: (row) => row.store.name || row.store.code || '-'
    },
    {
      title: `${group.name}合计`,
      key: 'dimensionScore',
      fixed: 'left',
      width: 110,
      sorter: 'default',
      render: (row) => h(NTag, { type: 'info' }, () => money(row.dimensionScore))
    },
    ...group.items.map((item) => ({
      title: () =>
        h('div', { class: 'score-col-title' }, [
          h('span', item.name),
          item.maxScore !== null
            ? h('small', `上限 ${scoreLimit(item.maxScore)}`)
            : null
        ]),
      key: item.id,
      width: 128,
      sorter: (left: DimensionScoreRow, right: DimensionScoreRow) =>
        getItemScore(left, item.id) - getItemScore(right, item.id),
      render: (row: DimensionScoreRow) => {
        const score = row.scores.find((entry) => entry.itemId === item.id);
        return h(
          NButton,
          {
            size: 'small',
            secondary: true,
            disabled: !canEdit.value,
            onClick: () => openEdit(row, item)
          },
          () => money(score?.score)
        );
      }
    }))
  ];
}

function buildRows(group: ScoreDimensionGroup): DimensionScoreRow[] {
  const scoreByStore = rows.value.map((row) => ({
    ...row,
    dimensionScore: group.items.reduce(
      (sum, item) => sum + getItemScore(row, item.id),
      0
    ),
    dimensionRank: 0
  }));

  const ranks = new Map<string, number>();
  [...scoreByStore]
    .sort((left, right) => right.dimensionScore - left.dimensionScore)
    .forEach((row, index) => {
      ranks.set(row.store.id, index + 1);
    });

  return scoreByStore.map((row) => ({
    ...row,
    dimensionRank: ranks.get(row.store.id) || 0
  }));
}

function buildTopStores(group: ScoreDimensionGroup) {
  return buildRows(group)
    .filter((row) => row.dimensionScore > 0)
    .sort((left, right) => left.dimensionRank - right.dimensionRank)
    .slice(0, 3);
}

function getItemScore(row: StoreScoreRow, itemId: string) {
  return Number(row.scores.find((entry) => entry.itemId === itemId)?.score || 0);
}

function openEdit(row: StoreScoreRow, item: ScoreItem) {
  const score = row.scores.find((entry) => entry.itemId === item.id);
  editingStoreId.value = row.store.id;
  editingItem.value = item;
  form.rawValue = score?.rawValue ?? null;
  form.score = score?.score ?? 0;
  form.remark = score?.remark ?? '';
  showModal.value = true;
}

async function save() {
  if (!editingItem.value) return;
  saving.value = true;
  try {
    await upsertScoreEntry({
      storeId: editingStoreId.value,
      itemId: editingItem.value.id,
      month: month.value,
      rawValue: form.rawValue,
      score: form.score,
      remark: form.remark
    });
    message.success('评分已保存');
    showModal.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

async function load() {
  loading.value = true;
  try {
    const result = await listMonthlyScoring(month.value);
    items.value = result.items;
    rows.value = result.rows;
    if (!activeDimension.value && dimensionGroups.value[0]) {
      activeDimension.value = dimensionGroups.value[0].code;
    }
  } finally {
    loading.value = false;
  }
}

function buildMonth(yearValue: number, monthValue: number) {
  return `${yearValue}-${String(monthValue).padStart(2, '0')}`;
}

function selectMonth(monthValue: number) {
  month.value = buildMonth(year.value, monthValue);
  showMonthPicker.value = false;
  void load();
}

function money(value?: number) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function scoreLimit(value?: string | number | null) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

watch(dimensionGroups, (groups) => {
  if (!groups.some((group) => group.code === activeDimension.value)) {
    activeDimension.value = groups[0]?.code || '';
  }
});

onMounted(load);
</script>
