<template>
  <div class="page-stack">
    <div class="section-head">
      <div><h1>V2 业务基础</h1><p>独立主数据和门店经营档案建设状态</p></div>
      <n-button :loading="loading" @click="load">刷新</n-button>
    </div>
    <n-alert type="info" :bordered="false">V2 当前与 V1 并行，不读取或覆盖 V1 业务数据。</n-alert>
    <div class="metric-strip">
      <div><span>组织</span><strong>{{ overview?.organizations.length ?? 0 }}</strong></div>
      <div><span>门店</span><strong>{{ overview?.stores.length ?? 0 }}</strong></div>
      <div><span>岗位模板</span><strong>{{ overview?.positionTemplates.length ?? 0 }}</strong></div>
      <div><span>已配置门店岗位</span><strong>{{ positionCount }}</strong></div>
    </div>
    <n-card title="V2 门店" :bordered="false">
      <n-empty v-if="!overview?.stores.length" description="尚未创建 V2 门店" />
      <n-data-table v-else :columns="columns" :data="overview.stores" :scroll-x="720" />
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue';
import { NDataTable, NTag, type DataTableColumns } from 'naive-ui';
import { getV2MasterDataOverview, type V2MasterDataOverview } from '@/api/v2-master-data';
import { storeDisplayName } from '@/utils/store-display';

type StoreRow = V2MasterDataOverview['stores'][number];
const loading = ref(false);
const overview = ref<V2MasterDataOverview | null>(null);
const positionCount = computed(() => overview.value?.stores.reduce((sum, store) => sum + store._count.positions, 0) ?? 0);
const columns: DataTableColumns<StoreRow> = [
  { title: '门店', key: 'name', minWidth: 160, render: (row) => storeDisplayName(row) },
  { title: '编号', key: 'code', minWidth: 120 },
  { title: '组织', key: 'organization', minWidth: 160, render: (row) => row.organization.name },
  { title: '状态', key: 'status', width: 110, render: (row) => h(NTag, { type: row.status === 'OPERATING' ? 'success' : 'default' }, { default: () => row.status }) },
  { title: '岗位', key: 'positions', width: 80, render: (row) => row._count.positions },
  { title: '任职', key: 'employments', width: 80, render: (row) => row._count.employments }
];

async function load() {
  loading.value = true;
  try { overview.value = await getV2MasterDataOverview(); } finally { loading.value = false; }
}
onMounted(() => void load());
</script>
