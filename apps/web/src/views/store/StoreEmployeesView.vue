<template>
  <section class="page-stack">
    <div class="section-head">
      <div>
        <h1>门店员工</h1>
        <p>维护门店员工资料，员工可作为门店经理或负责人。</p>
      </div>
      <n-button type="primary" @click="openCreate">新增员工</n-button>
    </div>

    <n-space align="center" class="filter-bar">
      <n-select
        v-model:value="selectedStoreId"
        clearable
        placeholder="全部门店"
        :options="storeOptions"
        class="filter-select"
        @update:value="loadEmployees"
      />
    </n-space>

    <n-data-table :columns="columns" :data="employees" :loading="loading" />

    <n-modal v-model:show="showModal" preset="card" title="员工信息" class="edit-modal">
      <n-form :model="form" label-placement="top">
        <n-grid :cols="2" :x-gap="16">
          <n-form-item-gi label="所属门店">
            <n-select v-model:value="form.storeId" :options="storeOptions" />
          </n-form-item-gi>
          <n-form-item-gi label="员工编号">
            <n-input v-model:value="form.employeeNo" :disabled="Boolean(editingId)" />
          </n-form-item-gi>
          <n-form-item-gi label="姓名">
            <n-input v-model:value="form.name" />
          </n-form-item-gi>
          <n-form-item-gi label="电话">
            <n-input v-model:value="form.phone" />
          </n-form-item-gi>
          <n-form-item-gi label="岗位">
            <n-select
              v-model:value="form.positionId"
              clearable
              :options="positionOptions"
            />
          </n-form-item-gi>
          <n-form-item-gi label="状态">
            <n-switch v-model:value="form.enabled" />
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
  createEmployee,
  listEmployees,
  listPositions,
  listStores,
  updateEmployee,
  type Employee,
  type EmployeePayload,
  type Position,
  type Store
} from '@/api/store';

const message = useMessage();
const loading = ref(false);
const saving = ref(false);
const showModal = ref(false);
const editingId = ref('');
const selectedStoreId = ref('');
const employees = ref<Employee[]>([]);
const stores = ref<Store[]>([]);
const positions = ref<Position[]>([]);

const form = reactive<EmployeePayload>({
  storeId: '',
  employeeNo: '',
  name: '',
  phone: '',
  position: '',
  positionId: null,
  enabled: true
});

const storeOptions = computed(() =>
  stores.value.map((store) => ({
    label: `${store.name} ${store.code}`,
    value: store.id
  }))
);
const positionOptions = computed(() =>
  positions.value.map((position) => ({
    label: `${position.name} ${position.code}`,
    value: position.id
  }))
);

const columns: DataTableColumns<Employee> = [
  { title: '姓名', key: 'name' },
  { title: '员工编号', key: 'employeeNo' },
  { title: '所属门店', key: 'store', render: (row) => row.store?.name || '-' },
  {
    title: '岗位',
    key: 'position',
    render: (row) => row.positionRef?.name || row.position || '-'
  },
  { title: '电话', key: 'phone', render: (row) => row.phone || '-' },
  {
    title: '状态',
    key: 'enabled',
    width: 90,
    render: (row) =>
      h(NTag, { type: row.enabled ? 'success' : 'warning' }, () =>
        row.enabled ? '启用' : '停用'
      )
  },
  {
    title: '操作',
    key: 'actions',
    width: 90,
    render: (row) => h(NButton, { size: 'small', onClick: () => openEdit(row) }, () => '编辑')
  }
];

function resetForm() {
  Object.assign(form, {
    storeId: selectedStoreId.value || stores.value[0]?.id || '',
    employeeNo: '',
    name: '',
    phone: '',
    position: '',
    positionId: null,
    enabled: true
  });
}

function openCreate() {
  editingId.value = '';
  resetForm();
  showModal.value = true;
}

function openEdit(row: Employee) {
  editingId.value = row.id;
  Object.assign(form, {
    storeId: row.storeId,
    employeeNo: row.employeeNo,
    name: row.name,
    phone: row.phone || '',
    position: row.position || row.positionRef?.name || '',
    positionId: row.positionId || row.positionRef?.id || null,
    enabled: row.enabled
  });
  showModal.value = true;
}

async function save() {
  saving.value = true;
  try {
    if (editingId.value) {
      await updateEmployee(editingId.value, form);
    } else {
      await createEmployee(form);
    }
    message.success('保存成功');
    showModal.value = false;
    await loadEmployees();
  } finally {
    saving.value = false;
  }
}

async function loadEmployees() {
  employees.value = await listEmployees(selectedStoreId.value || undefined);
}

async function load() {
  loading.value = true;
  try {
    const [employeeRows, storeRows, positionRows] = await Promise.all([
      listEmployees(selectedStoreId.value || undefined),
      listStores(),
      listPositions()
    ]);
    employees.value = employeeRows;
    stores.value = storeRows;
    positions.value = positionRows;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
