<template>
  <section class="page-stack">
    <div class="section-head">
      <div>
        <h1>岗位权限</h1>
        <p>维护员工岗位，以及岗位可访问的业务权限。</p>
      </div>
      <n-button type="primary" @click="openCreate">新增岗位</n-button>
    </div>

    <n-data-table :columns="columns" :data="positions" :loading="loading" />

    <n-modal v-model:show="showModal" preset="card" title="岗位信息" class="edit-modal">
      <n-form :model="form" label-placement="top">
        <n-grid :cols="2" :x-gap="16">
          <n-form-item-gi label="岗位名称">
            <n-input v-model:value="form.name" />
          </n-form-item-gi>
          <n-form-item-gi label="岗位编码">
            <n-input v-model:value="form.code" :disabled="Boolean(editingId)" />
          </n-form-item-gi>
          <n-form-item-gi label="描述" :span="2">
            <n-input v-model:value="form.description" />
          </n-form-item-gi>
          <n-form-item-gi label="权限" :span="2">
            <n-select
              v-model:value="form.permissionIds"
              multiple
              filterable
              :options="permissionOptions"
            />
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
  createPosition,
  listPermissions,
  listPositions,
  updatePosition,
  type Permission,
  type Position
} from '@/api/store';

const message = useMessage();
const loading = ref(false);
const saving = ref(false);
const showModal = ref(false);
const editingId = ref('');
const positions = ref<Position[]>([]);
const permissions = ref<Permission[]>([]);

const form = reactive({
  name: '',
  code: '',
  description: '',
  permissionIds: [] as string[]
});

const permissionOptions = computed(() =>
  permissions.value.map((permission) => ({
    label: `${permission.name} ${permission.code}`,
    value: permission.id
  }))
);

const columns: DataTableColumns<Position> = [
  { title: '岗位名称', key: 'name' },
  { title: '岗位编码', key: 'code' },
  {
    title: '员工数',
    key: 'employees',
    width: 90,
    render: (row) => row._count?.employees ?? 0
  },
  {
    title: '权限数',
    key: 'permissions',
    width: 90,
    render: (row) =>
      h(NTag, { type: 'info' }, () => String(row.permissions?.length ?? 0))
  },
  { title: '描述', key: 'description', render: (row) => row.description || '-' },
  {
    title: '操作',
    key: 'actions',
    width: 90,
    render: (row) => h(NButton, { size: 'small', onClick: () => openEdit(row) }, () => '编辑')
  }
];

function resetForm() {
  Object.assign(form, {
    name: '',
    code: '',
    description: '',
    permissionIds: []
  });
}

function openCreate() {
  editingId.value = '';
  resetForm();
  showModal.value = true;
}

function openEdit(row: Position) {
  editingId.value = row.id;
  Object.assign(form, {
    name: row.name,
    code: row.code,
    description: row.description || '',
    permissionIds: row.permissions?.map(({ permission }) => permission.id) ?? []
  });
  showModal.value = true;
}

async function save() {
  saving.value = true;
  try {
    if (editingId.value) {
      await updatePosition(editingId.value, {
        name: form.name,
        description: form.description,
        permissionIds: form.permissionIds
      });
    } else {
      await createPosition(form);
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
    const [positionRows, permissionRows] = await Promise.all([
      listPositions(),
      listPermissions()
    ]);
    positions.value = positionRows;
    permissions.value = permissionRows;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
