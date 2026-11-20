<template>
  <div class="page-stack">
    <div class="section-head">
      <div>
        <h1>统一岗位体系</h1>
        <p>所有门店共用系统岗位；岗位统一维护月薪、绩效薪资和时薪。</p>
      </div>
      <n-button type="primary" @click="openTemplate()">新增岗位</n-button>
    </div>
    <n-alert type="info" :bordered="false"
      >员工入职时选择月薪制或时薪制，同一时期只能使用一种。店长统一使用总部“店长职能岗”和P等级薪酬。</n-alert
    >
    <n-card title="门店基础岗位与固定薪酬" :bordered="false">
      <n-data-table
        :columns="columns"
        :data="overview?.positionTemplates || []"
        :row-key="(row: PositionTemplate) => row.id"
        :loading="loading"
        :scroll-x="820"
      />
    </n-card>
    <n-modal
      v-model:show="modalOpen"
      preset="card"
      :title="editing ? `编辑岗位 · ${editing.name}` : '新增统一岗位'"
      class="bc-modal-md"
      content-style="max-height: calc(100svh - 190px); overflow-y: auto;"
    >
      <n-form label-placement="top">
        <n-form-item label="岗位名称"
          ><n-input v-model:value="form.name"
        /></n-form-item>
        <n-form-item label="岗位编码"
          ><n-input :value="editing?.code || '保存后由系统自动生成'" disabled
        /></n-form-item>
        <n-form-item label="岗位说明"
          ><n-input v-model:value="form.description" type="textarea"
        /></n-form-item>
        <n-form-item label="岗位对应角色">
          <n-select v-model:value="form.roleId" :options="roleOptions" />
        </n-form-item>
        <n-divider>月薪标准</n-divider>
        <n-grid :cols="2" :x-gap="12">
          <n-form-item-gi label="基础薪资（元/月）"
            ><n-input-number
              v-model:value="form.monthlyBaseSalary"
              :min="0"
              :precision="2"
              class="full"
          /></n-form-item-gi>
          <n-form-item-gi label="绩效薪资（元/月）"
            ><n-input-number
              v-model:value="form.monthlyPerformanceSalary"
              :min="0"
              :precision="2"
              class="full"
          /></n-form-item-gi>
        </n-grid>
        <n-divider>时薪标准</n-divider>
        <n-form-item label="时薪（元/小时）"
          ><n-input-number
            v-model:value="form.hourlyRate"
            :min="0"
            :precision="2"
            class="full"
        /></n-form-item>
        <n-alert type="warning" :bordered="false"
          >时薪为0时，该岗位不能安排为时薪制。已锁定的历史工资结果不会回溯变化。</n-alert
        >
      </n-form>
      <template #footer
        ><n-space justify="end"
          ><n-button @click="modalOpen = false">取消</n-button
          ><n-button type="primary" :loading="saving" @click="save"
            >保存</n-button
          ></n-space
        ></template
      >
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import {
  NInputNumber,
  NSelect,
  NDataTable,
  NButton,
  NTag,
  useMessage,
  type DataTableColumns
} from 'naive-ui';
import {
  createV2PositionTemplate,
  getV2AccessControl,
  getV2MasterDataOverview,
  updateV2PositionTemplate,
  type V2MasterDataOverview,
  type V2AccessControl
} from '@/api/v2-master-data';

type PositionTemplate = V2MasterDataOverview['positionTemplates'][number];
const message = useMessage();
const overview = ref<V2MasterDataOverview | null>(null);
const access = ref<V2AccessControl | null>(null);
const modalOpen = ref(false),
  loading = ref(false),
  saving = ref(false);
const editing = ref<PositionTemplate | null>(null);
const form = reactive({
  name: '',
  description: '',
  monthlyBaseSalary: 0,
  monthlyPerformanceSalary: 0,
  hourlyRate: 0,
  roleId: undefined as string | undefined
});
const roleOptions = computed(() =>
  (access.value?.roles ?? [])
    .filter((role) => role.code !== 'super_admin')
    .map((role) => ({ label: role.name, value: role.id }))
);
const roleName = (roleId?: string | null) =>
  access.value?.roles.find((role) => role.id === roleId)?.name ?? '未关联';
const money = (value: string | number) => `¥${Number(value || 0).toFixed(2)}`;
const columns: DataTableColumns<PositionTemplate> = [
  { title: '岗位', key: 'name', minWidth: 130 },
  { title: '编码', key: 'code', minWidth: 150 },
  { title: '对应角色', key: 'roleId', render: (row) => roleName(row.roleId) },
  {
    title: '月薪基础',
    key: 'monthlyBaseSalary',
    render: (row) => money(row.monthlyBaseSalary)
  },
  {
    title: '月薪绩效',
    key: 'monthlyPerformanceSalary',
    render: (row) => money(row.monthlyPerformanceSalary)
  },
  {
    title: '时薪',
    key: 'hourlyRate',
    render: (row) =>
      Number(row.hourlyRate) > 0
        ? money(row.hourlyRate)
        : h(NTag, { size: 'small' }, { default: () => '不支持时薪' })
  },
  {
    title: '操作',
    key: 'actions',
    width: 90,
    render: (row) =>
      h(
        NButton,
        { size: 'small', onClick: () => openTemplate(row) },
        { default: () => '编辑' }
      )
  }
];
async function load() {
  loading.value = true;
  try {
    [overview.value, access.value] = await Promise.all([
      getV2MasterDataOverview(),
      getV2AccessControl()
    ]);
  } finally {
    loading.value = false;
  }
}
function openTemplate(row?: PositionTemplate) {
  editing.value = row ?? null;
  Object.assign(form, {
    name: row?.name ?? '',
    description: row?.description ?? '',
    monthlyBaseSalary: Number(row?.monthlyBaseSalary ?? 0),
    monthlyPerformanceSalary: Number(row?.monthlyPerformanceSalary ?? 0),
    hourlyRate: Number(row?.hourlyRate ?? 0),
    roleId:
      row?.roleId ??
      roleOptions.value.find((item) => item.label === '门店员工')?.value
  });
  modalOpen.value = true;
}
async function save() {
  if (!form.name.trim()) return message.warning('请输入岗位名称');
  saving.value = true;
  try {
    if (editing.value) await updateV2PositionTemplate(editing.value.id, form);
    else await createV2PositionTemplate(form);
    modalOpen.value = false;
    await load();
    message.success('统一岗位及薪酬标准已保存');
  } finally {
    saving.value = false;
  }
}
onMounted(load);
</script>
