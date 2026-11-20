<template>
  <div class="page-stack">
    <div class="section-head">
      <div>
        <n-button text @click="router.push('/v2/operations')"
          >← 返回运营配置</n-button
        >
          <h1>{{ schedule ? storeDisplayName(schedule.store) : '排班编辑' }}</h1>
        <p v-if="schedule">
          {{ shortDate(schedule.startsOn) }} 至
          {{ shortDate(schedule.endsOn) }} · {{ statusText }}
        </p>
      </div>
      <n-space
        ><n-button v-if="!options?.shifts.length" @click="inheritShifts"
          >继承默认班次</n-button
        ><n-button v-if="schedule?.status === 'DRAFT'" @click="publish"
          >发布排班</n-button
        ><n-button
          v-if="schedule?.status === 'PUBLISHED'"
          type="warning"
          @click="lock"
          >锁定排班</n-button
        ><n-button
          type="primary"
          :disabled="schedule?.status === 'LOCKED'"
          @click="openAdd"
          >添加排岗</n-button
        ></n-space
      >
    </div>
    <n-alert
      v-if="schedule?.status === 'LOCKED'"
      type="warning"
      :bordered="false"
      >该周期已经锁定，历史排班不可再修改。</n-alert
    >
    <div class="metric-strip">
      <div>
        <span>周期天数</span><strong>{{ dateOptions.length }}</strong>
      </div>
      <div>
        <span>班次</span><strong>{{ options?.shifts.length ?? 0 }}</strong>
      </div>
      <div>
        <span>在岗员工</span
        ><strong>{{ options?.employments.length ?? 0 }}</strong>
      </div>
      <div>
        <span>排岗记录</span
        ><strong>{{ schedule?.assignments.length ?? 0 }}</strong>
      </div>
    </div>
    <n-card title="排班明细" :bordered="false"
      ><n-empty
        v-if="!schedule?.assignments.length"
        description="尚未安排员工班次" /><n-data-table
        v-else
        :columns="columns"
        :data="schedule.assignments"
        :scroll-x="760"
    /></n-card>
    <n-modal
      v-model:show="addOpen"
      preset="card"
      title="添加排岗"
      class="edit-modal"
      ><n-form label-placement="top"
        ><n-form-item label="日期"
          ><n-select
            v-model:value="form.workDate"
            :options="dateOptions" /></n-form-item
        ><n-form-item label="班次"
          ><n-select
            v-model:value="form.shiftId"
            :options="shiftOptions" /></n-form-item
        ><n-form-item label="员工 / 岗位"
          ><n-select
            v-model:value="form.employmentId"
            :options="employmentOptions" /></n-form-item
        ><n-form-item label="备注"
          ><n-input
            v-model:value="form.note"
            type="textarea" /></n-form-item></n-form
      ><template #footer
        ><n-space justify="end"
          ><n-button @click="addOpen = false">取消</n-button
          ><n-button type="primary" :loading="saving" @click="saveAssignment"
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
  NSelect,
  NDataTable,
  NButton,
  NPopconfirm,
  NTag,
  type DataTableColumns,
  useDialog,
  useMessage
} from 'naive-ui';
import { useRoute, useRouter } from 'vue-router';
import {
  createV2ScheduleAssignment,
  deleteV2ScheduleAssignment,
  getV2Schedule,
  getV2ScheduleOptions,
  inheritV2Shifts,
  lockV2Schedule,
  publishV2Schedule,
  type V2ScheduleDetail,
  type V2ScheduleOptions
} from '@/api/v2-operations';
import { storeDisplayName } from '@/utils/store-display';
type Assignment = V2ScheduleDetail['assignments'][number];
const route = useRoute(),
  router = useRouter(),
  message = useMessage(),
  dialog = useDialog(),
  schedule = ref<V2ScheduleDetail | null>(null),
  options = ref<V2ScheduleOptions | null>(null),
  addOpen = ref(false),
  saving = ref(false),
  form = reactive<Record<string, string>>({});
const statusText = computed(
    () =>
      (
        ({ DRAFT: '草稿', PUBLISHED: '已发布', LOCKED: '已锁定' }) as Record<
          string,
          string
        >
      )[schedule.value?.status ?? ''] ?? ''
  ),
  shiftOptions = computed(
    () =>
      options.value?.shifts.map((i) => ({
        label: `${i.name} ${i.startsAt}-${i.endsAt}`,
        value: i.id
      })) ?? []
  ),
  employmentOptions = computed(
    () =>
      options.value?.employments.map((i) => ({
        label: `${i.employee.name} · ${i.position.name}`,
        value: i.id
      })) ?? []
  ),
  dateOptions = computed(() => {
    if (!schedule.value) return [];
    const result = [];
    const end = new Date(schedule.value.endsOn);
    for (
      let date = new Date(schedule.value.startsOn);
      date <= end;
      date.setUTCDate(date.getUTCDate() + 1)
    ) {
      const value = date.toISOString().slice(0, 10);
      result.push({ label: value, value });
    }
    return result;
  });
const columns: DataTableColumns<Assignment> = [
  {
    title: '日期',
    key: 'workDate',
    width: 120,
    render: (r) => shortDate(r.workDate)
  },
  {
    title: '班次',
    key: 'shift',
    minWidth: 150,
    render: (r) => `${r.shift.name} ${r.shift.startsAt}-${r.shift.endsAt}`
  },
  {
    title: '员工',
    key: 'employee',
    minWidth: 120,
    render: (r) => r.employee.name
  },
  {
    title: '岗位',
    key: 'position',
    minWidth: 110,
    render: (r) => r.position.name
  },
  {
    title: '状态',
    key: 'locked',
    width: 90,
    render: (r) =>
      h(
        NTag,
        { size: 'small', type: r.lockedAt ? 'warning' : 'default' },
        { default: () => (r.lockedAt ? '锁定' : '可编辑') }
      )
  },
  {
    title: '操作',
    key: 'actions',
    width: 90,
    render: (r) =>
      schedule.value?.status === 'LOCKED'
        ? '-'
        : h(
            NPopconfirm,
            { onPositiveClick: () => remove(r.id) },
            {
              trigger: () =>
                h(
                  NButton,
                  { size: 'tiny', type: 'error', secondary: true },
                  { default: () => '删除' }
                ),
              default: () => '确认删除该排岗？'
            }
          )
  }
];
function shortDate(value: string) {
  return value.slice(0, 10);
}
async function load() {
  schedule.value = await getV2Schedule(String(route.params.id));
  options.value = await getV2ScheduleOptions(schedule.value.storeId);
}
function openAdd() {
  if (!options.value?.shifts.length)
    return message.warning('请先继承或配置门店班次');
  if (!options.value.employments.length)
    return message.warning('该门店暂无在岗员工');
  Object.assign(form, {
    workDate: dateOptions.value[0]?.value,
    shiftId: shiftOptions.value[0]?.value,
    employmentId: employmentOptions.value[0]?.value,
    note: ''
  });
  addOpen.value = true;
}
async function saveAssignment() {
  const employment = options.value?.employments.find(
    (i) => i.id === form.employmentId
  );
  if (!schedule.value || !employment) return;
  saving.value = true;
  try {
    await createV2ScheduleAssignment({
      periodId: schedule.value.id,
      workDate: form.workDate,
      shiftId: form.shiftId,
      employeeId: employment.employee.id,
      positionId: employment.position.id,
      note: form.note
    });
    addOpen.value = false;
    await load();
    message.success('排岗已添加');
  } finally {
    saving.value = false;
  }
}
async function remove(id: string) {
  await deleteV2ScheduleAssignment(id);
  await load();
  message.success('已删除');
}
async function inheritShifts() {
  if (!schedule.value) return;
  await inheritV2Shifts(schedule.value.storeId);
  await load();
  message.success('默认班次已继承');
}
function publish() {
  if (!schedule.value) return;
  dialog.warning({
    title: '发布排班',
    content: '发布后仍可调整，员工可按发布状态查看。确认发布？',
    positiveText: '发布',
    negativeText: '取消',
    onPositiveClick: async () => {
      await publishV2Schedule(schedule.value!.id);
      await load();
    }
  });
}
function lock() {
  if (!schedule.value) return;
  dialog.warning({
    title: '锁定排班',
    content: '锁定后该周期及全部排岗不可再修改。确认锁定？',
    positiveText: '锁定',
    negativeText: '取消',
    onPositiveClick: async () => {
      await lockV2Schedule(schedule.value!.id);
      await load();
    }
  });
}
onMounted(() => void load());
</script>
