<template>
  <section class="page-stack">
    <div class="section-head">
      <div>
        <h1>门店资料</h1>
        <p>维护网咖门店基础信息、机器规模、地理位置与负责人。</p>
      </div>
      <n-button type="primary" @click="openCreate">新增门店</n-button>
    </div>

    <n-data-table :columns="columns" :data="stores" :loading="loading" />

    <n-modal v-model:show="showModal" preset="card" title="门店信息" class="edit-modal">
      <n-form :model="form" label-placement="top">
        <n-grid :cols="2" :x-gap="16">
          <n-form-item-gi label="门店名称">
            <n-input v-model:value="form.name" />
          </n-form-item-gi>
          <n-form-item-gi label="门店编号">
            <n-input v-model:value="form.code" />
          </n-form-item-gi>
          <n-form-item-gi label="所属组织 ID">
            <n-input v-model:value="form.orgId" />
          </n-form-item-gi>
          <n-form-item-gi label="机器数量">
            <n-input-number v-model:value="form.machineCount" :min="0" class="full" />
          </n-form-item-gi>
          <n-form-item-gi label="电话">
            <n-input v-model:value="form.phone" />
          </n-form-item-gi>
          <n-form-item-gi label="状态">
            <n-select v-model:value="form.status" :options="statusOptions" />
          </n-form-item-gi>
          <n-form-item-gi label="经度">
            <n-input-number v-model:value="form.longitude" class="full" />
          </n-form-item-gi>
          <n-form-item-gi label="纬度">
            <n-input-number v-model:value="form.latitude" class="full" />
          </n-form-item-gi>
          <n-form-item-gi label="门店经理">
            <n-select
              v-model:value="form.managerEmployeeId"
              clearable
              :options="employeeOptions"
            />
          </n-form-item-gi>
          <n-form-item-gi label="负责人">
            <n-select
              v-model:value="form.responsibleEmployeeId"
              clearable
              :options="employeeOptions"
            />
          </n-form-item-gi>
          <n-form-item-gi label="地址" :span="2">
            <n-input v-model:value="form.address" />
          </n-form-item-gi>
        </n-grid>
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
  createStore,
  listEmployees,
  listStores,
  updateStore,
  type Employee,
  type Store,
  type StorePayload
} from '@/api/store';

const message = useMessage();
const loading = ref(false);
const saving = ref(false);
const showModal = ref(false);
const editingId = ref('');
const stores = ref<Store[]>([]);
const employees = ref<Employee[]>([]);

const form = reactive<StorePayload>({
  orgId: '',
  name: '',
  code: '',
  status: 'ENABLED',
  machineCount: 0,
  address: '',
  phone: '',
  longitude: null,
  latitude: null,
  managerEmployeeId: null,
  responsibleEmployeeId: null
});

const statusOptions = [
  { label: '启用', value: 'ENABLED' },
  { label: '停用', value: 'DISABLED' }
];

const employeeOptions = computedEmployeeOptions();

const columns: DataTableColumns<Store> = [
  { title: '门店名称', key: 'name' },
  { title: '编号', key: 'code' },
  { title: '机器数', key: 'machineCount', width: 90 },
  {
    title: '员工数',
    key: 'employees',
    width: 90,
    render: (row) => row._count?.employees ?? 0
  },
  {
    title: '区域数',
    key: 'areas',
    width: 90,
    render: (row) => row._count?.areas ?? 0
  },
  { title: '经理', key: 'manager', render: (row) => row.managerEmployee?.name || '-' },
  { title: '负责人', key: 'responsible', render: (row) => row.responsibleEmployee?.name || '-' },
  {
    title: '状态',
    key: 'status',
    width: 90,
    render: (row) =>
      h(NTag, { type: row.status === 'ENABLED' ? 'success' : 'warning' }, () =>
        row.status === 'ENABLED' ? '启用' : '停用'
      )
  },
  {
    title: '操作',
    key: 'actions',
    width: 90,
    render: (row) => h(NButton, { size: 'small', onClick: () => openEdit(row) }, () => '编辑')
  }
];

function computedEmployeeOptions() {
  return computed(() =>
    employees.value.map((employee) => ({
      label: `${employee.name} ${employee.employeeNo}`,
      value: employee.id
    }))
  );
}

function resetForm() {
  Object.assign(form, {
    orgId: stores.value[0]?.orgId || '',
    name: '',
    code: '',
    status: 'ENABLED',
    machineCount: 0,
    address: '',
    phone: '',
    longitude: null,
    latitude: null,
    managerEmployeeId: null,
    responsibleEmployeeId: null
  });
}

function openCreate() {
  editingId.value = '';
  resetForm();
  showModal.value = true;
}

function openEdit(row: Store) {
  editingId.value = row.id;
  Object.assign(form, {
    orgId: row.orgId,
    name: row.name,
    code: row.code,
    status: row.status,
    machineCount: row.machineCount,
    address: row.address || '',
    phone: row.phone || '',
    longitude: row.longitude ? Number(row.longitude) : null,
    latitude: row.latitude ? Number(row.latitude) : null,
    managerEmployeeId: row.managerEmployeeId || null,
    responsibleEmployeeId: row.responsibleEmployeeId || null
  });
  showModal.value = true;
}

async function save() {
  saving.value = true;
  try {
    if (editingId.value) {
      await updateStore(editingId.value, form);
    } else {
      await createStore(form);
    }
    message.success('保存成功');
    showModal.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

async function load() {
  loading.value = true;
  try {
    const [storeRows, employeeRows] = await Promise.all([listStores(), listEmployees()]);
    stores.value = storeRows;
    employees.value = employeeRows;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
