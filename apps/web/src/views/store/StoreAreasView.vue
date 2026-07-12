<template>
  <section class="page-stack">
    <div class="section-head">
      <div>
        <h1>区域与价格</h1>
        <p>维护包厢/区域配置，以及不同会员等级的上机单价。</p>
      </div>
      <n-button type="primary" @click="openCreate">新增区域</n-button>
    </div>

    <n-space align="center" class="filter-bar">
      <n-select
        v-model:value="selectedStoreId"
        clearable
        placeholder="全部门店"
        :options="storeOptions"
        class="filter-select"
        @update:value="loadAreas"
      />
    </n-space>

    <n-data-table :columns="columns" :data="areas" :loading="loading" />

    <n-modal v-model:show="showAreaModal" preset="card" title="区域信息" class="edit-modal">
      <n-form :model="areaForm" label-placement="top">
        <n-grid :cols="2" :x-gap="16">
          <n-form-item-gi label="所属门店">
            <n-select v-model:value="areaForm.storeId" :options="storeOptions" />
          </n-form-item-gi>
          <n-form-item-gi label="区域编号">
            <n-input v-model:value="areaForm.code" :disabled="Boolean(editingId)" />
          </n-form-item-gi>
          <n-form-item-gi label="区域名称">
            <n-input v-model:value="areaForm.name" />
          </n-form-item-gi>
          <n-form-item-gi label="区域等级">
            <n-select v-model:value="areaForm.level" :options="levelOptions" />
          </n-form-item-gi>
          <n-form-item-gi label="机器数量">
            <n-input-number v-model:value="areaForm.machineCount" :min="0" class="full" />
          </n-form-item-gi>
          <n-form-item-gi label="显卡型号">
            <n-input v-model:value="areaForm.gpuModel" />
          </n-form-item-gi>
          <n-form-item-gi label="CPU">
            <n-input v-model:value="areaForm.cpuModel" />
          </n-form-item-gi>
          <n-form-item-gi label="显示器">
            <n-input v-model:value="areaForm.monitorModel" />
          </n-form-item-gi>
        </n-grid>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showAreaModal = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="saveArea">保存</n-button>
        </n-space>
      </template>
    </n-modal>

    <n-modal v-model:show="showPriceModal" preset="card" title="区域价格" class="edit-modal">
      <div class="price-grid">
        <n-form-item v-for="item in priceForm" :key="item.tier" :label="tierLabels[item.tier]">
          <n-input-number v-model:value="item.price" :min="0" class="full" />
        </n-form-item>
      </div>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showPriceModal = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="savePrices">保存价格</n-button>
        </n-space>
      </template>
    </n-modal>
  </section>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { NButton, NSpace, NTag, useMessage, type DataTableColumns } from 'naive-ui';
import {
  AREA_LEVEL_LABELS,
  MEMBER_PRICE_TIER_LABELS,
  createStoreArea,
  listStoreAreas,
  listStores,
  updateStoreArea,
  upsertAreaPrices,
  type AreaPayload,
  type MemberPriceTier,
  type Store,
  type StoreArea,
  type StoreAreaLevel
} from '@/api/store';

const priceTiers = Object.keys(MEMBER_PRICE_TIER_LABELS) as MemberPriceTier[];
const tierLabels = MEMBER_PRICE_TIER_LABELS;
const message = useMessage();
const loading = ref(false);
const saving = ref(false);
const showAreaModal = ref(false);
const showPriceModal = ref(false);
const editingId = ref('');
const pricingAreaId = ref('');
const selectedStoreId = ref('');
const areas = ref<StoreArea[]>([]);
const stores = ref<Store[]>([]);
const priceForm = ref(priceTiers.map((tier) => ({ tier, price: 0 })));

const areaForm = reactive<AreaPayload>({
  storeId: '',
  name: '',
  code: '',
  level: 'MID',
  machineCount: 0,
  gpuModel: '',
  cpuModel: '',
  monitorModel: ''
});

const storeOptions = computed(() =>
  stores.value.map((store) => ({ label: `${store.name} ${store.code}`, value: store.id }))
);
const levelOptions = (Object.keys(AREA_LEVEL_LABELS) as StoreAreaLevel[]).map((value) => ({
  label: AREA_LEVEL_LABELS[value],
  value
}));

const columns: DataTableColumns<StoreArea> = [
  { title: '区域名称', key: 'name' },
  { title: '编号', key: 'code' },
  { title: '门店', key: 'store', render: (row) => row.store?.name || '-' },
  {
    title: '等级',
    key: 'level',
    width: 90,
    render: (row) => h(NTag, { type: levelTag(row.level) }, () => AREA_LEVEL_LABELS[row.level])
  },
  { title: '机器数', key: 'machineCount', width: 90 },
  { title: '显卡', key: 'gpuModel', render: (row) => row.gpuModel || '-' },
  { title: 'CPU', key: 'cpuModel', render: (row) => row.cpuModel || '-' },
  { title: '显示器', key: 'monitorModel', render: (row) => row.monitorModel || '-' },
  {
    title: '操作',
    key: 'actions',
    width: 160,
    render: (row) =>
      h(NSpace, { size: 8 }, () => [
        h(NButton, { size: 'small', onClick: () => openEdit(row) }, () => '编辑'),
        h(NButton, { size: 'small', secondary: true, onClick: () => openPrices(row) }, () => '价格')
      ])
  }
];

function levelTag(level: StoreAreaLevel) {
  return level === 'HIGH' ? 'success' : level === 'MID' ? 'info' : 'default';
}

function resetAreaForm() {
  Object.assign(areaForm, {
    storeId: selectedStoreId.value || stores.value[0]?.id || '',
    name: '',
    code: '',
    level: 'MID',
    machineCount: 0,
    gpuModel: '',
    cpuModel: '',
    monitorModel: ''
  });
}

function openCreate() {
  editingId.value = '';
  resetAreaForm();
  showAreaModal.value = true;
}

function openEdit(row: StoreArea) {
  editingId.value = row.id;
  Object.assign(areaForm, {
    storeId: row.storeId,
    name: row.name,
    code: row.code,
    level: row.level,
    machineCount: row.machineCount,
    gpuModel: row.gpuModel || '',
    cpuModel: row.cpuModel || '',
    monitorModel: row.monitorModel || ''
  });
  showAreaModal.value = true;
}

function openPrices(row: StoreArea) {
  pricingAreaId.value = row.id;
  priceForm.value = priceTiers.map((tier) => ({
    tier,
    price: Number(row.prices?.find((price) => price.tier === tier)?.price || 0)
  }));
  showPriceModal.value = true;
}

async function saveArea() {
  saving.value = true;
  try {
    if (editingId.value) {
      await updateStoreArea(editingId.value, areaForm);
    } else {
      await createStoreArea(areaForm);
    }
    message.success('保存成功');
    showAreaModal.value = false;
    await loadAreas();
  } finally {
    saving.value = false;
  }
}

async function savePrices() {
  saving.value = true;
  try {
    await upsertAreaPrices(pricingAreaId.value, priceForm.value);
    message.success('价格已保存');
    showPriceModal.value = false;
    await loadAreas();
  } finally {
    saving.value = false;
  }
}

async function loadAreas() {
  areas.value = await listStoreAreas(selectedStoreId.value || undefined);
}

async function load() {
  loading.value = true;
  try {
    const [areaRows, storeRows] = await Promise.all([
      listStoreAreas(selectedStoreId.value || undefined),
      listStores()
    ]);
    areas.value = areaRows;
    stores.value = storeRows;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
