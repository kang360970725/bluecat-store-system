<template>
  <div class="page-stack">
    <div class="section-head">
      <div>
        <h1>职级维护</h1>
        <p>
          维护店长 P 序列和总部 M
          序列的基础工资、绩效基数；新增职级后会自动出现在薪资档案中。
        </p>
      </div>
      <n-button type="primary" @click="open()">新增职级</n-button>
    </div>
    <n-card title="P 等级（门店店长）" :bordered="false"
      ><n-data-table :columns="columns" :data="pRows"
    /></n-card>
    <n-card title="M 等级（总部人员）" :bordered="false"
      ><n-data-table :columns="columns" :data="mRows"
    /></n-card>
    <n-modal
      v-model:show="modalOpen"
      preset="card"
      :title="editing ? '编辑职级' : '新增职级'"
      class="bc-modal-md"
      ><n-form label-placement="top"
        ><n-grid :cols="2" :x-gap="12"
          ><n-form-item-gi label="职级体系"
            ><n-select
              v-model:value="form.employeeType"
              :options="typeOptions" /></n-form-item-gi
          ><n-form-item-gi label="职级编码"
            ><n-input
              v-model:value="form.grade"
              placeholder="例如 P5 或 M7" /></n-form-item-gi></n-grid
        ><n-form-item
          v-if="form.employeeType === 'HEAD_OFFICE'"
          label="岗位类别"
          ><n-select
            v-model:value="form.category"
            :options="categoryOptions" /></n-form-item
        ><n-form-item label="名称"
          ><n-input v-model:value="form.name" /></n-form-item
        ><n-grid :cols="2" :x-gap="12"
          ><n-form-item-gi label="基础工资"
            ><n-input-number
              v-model:value="form.baseSalary"
              :min="0" /></n-form-item-gi
          ><n-form-item-gi label="绩效基数"
            ><n-input-number
              v-model:value="form.performanceBase"
              :min="0" /></n-form-item-gi></n-grid></n-form
      ><template #footer
        ><n-space justify="end"
          ><n-button @click="modalOpen = false">取消</n-button
          ><n-button type="primary" :loading="saving" @click="save"
            >保存</n-button
          ></n-space
        ></template
      ></n-modal
    >
  </div>
</template>
<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import {
  NInputNumber,
  NDataTable,
  NButton,
  type DataTableColumns,
  useMessage
} from 'naive-ui';
import { NSelect } from '@/components/Select';
import {
  createV2PayrollGrade,
  getV2PayrollGrades,
  updateV2PayrollGrade,
  type V2PayrollProfileTemplate
} from '@/api/v2-master-data';
const message = useMessage(),
  rows = ref<V2PayrollProfileTemplate[]>([]),
  modalOpen = ref(false),
  saving = ref(false),
  editing = ref<V2PayrollProfileTemplate | null>(null),
  form = reactive<Record<string, any>>({});
const pRows = computed(() =>
    rows.value.filter((x) => x.employeeType === 'STORE_MANAGER')
  ),
  mRows = computed(() =>
    rows.value.filter((x) => x.employeeType === 'HEAD_OFFICE')
  );
const typeOptions = [
    { label: 'P等级（门店店长）', value: 'STORE_MANAGER' },
    { label: 'M等级（总部）', value: 'HEAD_OFFICE' }
  ],
  categoryOptions = ['一类', '二类', '三类'].map((value) => ({
    label: value,
    value
  }));
const columns: DataTableColumns<V2PayrollProfileTemplate> = [
  { title: '职级', key: 'grade', width: 90 },
  {
    title: '类别',
    key: 'category',
    width: 90,
    render: (r) => r.category || '-'
  },
  { title: '名称', key: 'name' },
  { title: '基础工资', key: 'baseSalary' },
  { title: '绩效基数', key: 'performanceBase' },
  {
    title: '操作',
    key: 'action',
    width: 90,
    render: (r) =>
      h(NButton, { size: 'small', onClick: () => open(r) }, () => '编辑')
  }
];
async function load() {
  rows.value = await getV2PayrollGrades();
}
function open(row?: V2PayrollProfileTemplate) {
  editing.value = row || null;
  Object.assign(form, {
    employeeType: row?.employeeType || 'STORE_MANAGER',
    grade: row?.grade || '',
    category: row?.category || undefined,
    name: row?.name || '',
    baseSalary: Number(row?.baseSalary || 0),
    performanceBase: Number(row?.performanceBase || 0)
  });
  modalOpen.value = true;
}
async function save() {
  if (!form.grade || !form.name) return message.warning('请填写职级编码和名称');
  saving.value = true;
  try {
    if (editing.value) await updateV2PayrollGrade(editing.value.id, form);
    else await createV2PayrollGrade(form);
    modalOpen.value = false;
    await load();
    message.success('职级标准已保存');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}
onMounted(load);
</script>
