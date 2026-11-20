<template>
  <div class="page-stack schedule-page">
    <div class="schedule-head">
      <div>
        <n-button text @click="backToStore">← 返回门店工作台</n-button>
        <h1>{{ schedule ? storeDisplayName(schedule.store) : '排班管理' }}</h1>
        <p v-if="schedule">
          {{ shortDate(schedule.startsOn) }} 至 {{ shortDate(schedule.endsOn) }}
          <n-tag size="small" :type="statusType">{{ statusText }}</n-tag>
        </p>
      </div>
      <n-space>
        <n-button v-if="canManage" @click="shiftOpen = true">班次设置</n-button>
        <n-button v-if="canManage" @click="successionOpen = true"
          >工作继承</n-button
        >
        <n-button
          v-if="canManage && schedule?.status === 'DRAFT'"
          secondary
          @click="copyPrevious"
          >复制上月排班</n-button
        >
        <n-button
          v-if="canManage && schedule?.status === 'DRAFT'"
          type="primary"
          secondary
          @click="batchOpen = true"
          >批量排班</n-button
        >
        <n-button
          v-if="canManage && schedule?.status === 'DRAFT'"
          type="primary"
          @click="publish"
          >发布排班</n-button
        >
        <n-button
          v-if="canManage && schedule?.status === 'PUBLISHED'"
          type="warning"
          @click="lock"
          >锁定排班</n-button
        >
      </n-space>
    </div>

    <n-alert
      v-if="schedule?.status === 'LOCKED'"
      type="warning"
      :bordered="false"
    >
      该周期已锁定，历史排班和已产生考勤的班次不可修改。
    </n-alert>
    <n-alert v-else type="info" :bordered="false">
      收银、外场建议每组 3
      人套用「白白夜夜休休」；客服、吧员和机动岗先配置本店班次，再按实际高峰期排班。
    </n-alert>

    <div class="metric-strip schedule-metrics">
      <div>
        <span>排班天数</span><strong>{{ allDates.length }}</strong>
      </div>
      <div>
        <span>在岗员工</span><strong>{{ employeeRows.length }}</strong>
      </div>
      <div>
        <span>工作班次</span><strong>{{ workCount }}</strong>
      </div>
      <div>
        <span>休息安排</span><strong>{{ restCount }}</strong>
      </div>
      <div :class="{ 'metric-warning': missingCount }">
        <span>未排日</span><strong>{{ missingCount }}</strong
        ><small>空白不等于休息</small>
      </div>
    </div>

    <n-card :bordered="false" class="schedule-board-card">
      <div class="board-toolbar">
        <n-radio-group v-model:value="viewMode" size="small">
          <n-radio-button value="WEEK">周视图</n-radio-button>
          <n-radio-button value="MONTH">月视图</n-radio-button>
        </n-radio-group>
        <n-space v-if="viewMode === 'WEEK'" align="center">
          <n-button
            size="small"
            :disabled="weekStart === 0"
            @click="weekStart = Math.max(0, weekStart - 7)"
            >上一周</n-button
          >
          <span class="week-label">{{ weekLabel }}</span>
          <n-button
            size="small"
            :disabled="weekStart + 7 >= allDates.length"
            @click="weekStart += 7"
            >下一周</n-button
          >
        </n-space>
        <n-space>
          <n-button size="small" secondary @click="load">刷新</n-button>
          <n-button
            v-if="canManage"
            size="small"
            type="primary"
            @click="openAdd"
            >添加单条</n-button
          >
        </n-space>
      </div>

      <n-spin :show="loading">
        <div class="matrix-wrap">
          <table
            class="schedule-matrix"
            :class="{ monthly: viewMode === 'MONTH' }"
          >
            <thead>
              <tr>
                <th class="employee-column">员工 / 岗位</th>
                <th
                  v-for="date in visibleDates"
                  :key="date"
                  :class="{ weekend: isWeekend(date) }"
                >
                  <span>{{ dayNumber(date) }}</span
                  ><small>{{ weekday(date) }}</small>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in employeeRows" :key="row.employee.id">
                <th class="employee-column">
                  <strong>{{ row.employee.name }}</strong>
                  <small>
                    {{ row.position.name }} · 休
                    {{ employeeRestCount(row.employee.id) }} 天
                    <b
                      v-if="positionRestTarget(row.position.name)"
                      :class="{
                        'rest-alert': employeeRestCount(row.employee.id) !== 4
                      }"
                      >/ 4</b
                    >
                  </small>
                </th>
                <td
                  v-for="date in visibleDates"
                  :key="date"
                  :class="
                    employmentActiveOn(row, date)
                      ? cellClass(cellFor(row.employee.id, date))
                      : 'is-inactive'
                  "
                  @click="
                    canManage &&
                    employmentActiveOn(row, date) &&
                    openCell(row, date)
                  "
                >
                  <template v-if="cellFor(row.employee.id, date)?.isRest">
                    <span class="cell-name">休息</span>
                  </template>
                  <template v-else-if="cellFor(row.employee.id, date)">
                    <span class="cell-name">{{
                      cellFor(row.employee.id, date)?.shift?.name
                    }}</span>
                    <small>{{
                      cellFor(row.employee.id, date)?.shift?.startsAt
                    }}</small>
                  </template>
                  <span
                    v-else-if="employmentActiveOn(row, date)"
                    class="cell-empty"
                    >+</span
                  >
                  <span
                    v-if="overtimeFor(row.employee.id, date)"
                    class="overtime-mark"
                    >加</span
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <n-empty v-if="!employeeRows.length" description="本店暂无在岗员工" />
      </n-spin>
      <div class="matrix-legend">
        <span><i class="day" />早班 / 白班</span>
        <span><i class="night" />晚班 / 夜班</span>
        <span><i class="custom" />自定义班次</span>
        <span><i class="rest" />休息</span>
        <span><i class="missing" />未排</span>
      </div>
    </n-card>

    <n-modal
      v-model:show="cellOpen"
      preset="card"
      title="调整当日排班"
      class="edit-modal"
    >
      <n-form label-placement="top">
        <n-form-item label="员工"
          ><n-input :value="cellEmployeeLabel" disabled
        /></n-form-item>
        <n-form-item label="日期"
          ><n-input :value="cellForm.workDate" disabled
        /></n-form-item>
        <n-form-item label="安排">
          <n-select
            v-model:value="cellForm.shiftValue"
            :options="cellShiftOptions"
          />
        </n-form-item>
        <n-form-item label="备注"
          ><n-input
            v-model:value="cellForm.note"
            type="textarea"
            maxlength="500"
        /></n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="space-between">
          <n-space>
            <n-button
              v-if="cellForm.assignmentId"
              type="error"
              secondary
              :loading="saving"
              @click="removeCell"
              >删除安排</n-button
            >
            <n-button
              v-if="
                cellForm.isRest ||
                !cellForm.assignmentId ||
                overtimeFor(cellForm.employeeId, cellForm.workDate)
              "
              type="warning"
              secondary
              @click="openOvertime"
            >
              {{
                overtimeFor(cellForm.employeeId, cellForm.workDate)
                  ? '调整加班'
                  : '安排加班'
              }}
            </n-button>
          </n-space>
          <n-space
            ><n-button @click="cellOpen = false">取消</n-button
            ><n-button
              type="primary"
              :loading="saving"
              :disabled="!cellForm.shiftValue"
              @click="saveCell"
              >保存</n-button
            ></n-space
          >
        </n-space>
      </template>
    </n-modal>

    <n-modal
      v-model:show="overtimeOpen"
      preset="card"
      title="加班排班"
      class="edit-modal"
    >
      <n-alert type="warning" :bordered="false"
        >当日已排普通工作班的员工不能再排加班。加班同样需要打上下班卡。</n-alert
      >
      <n-form label-placement="top">
        <n-form-item label="员工 / 日期"
          ><n-input
            :value="`${cellEmployeeLabel} · ${cellForm.workDate}`"
            disabled
        /></n-form-item>
        <n-form-item label="加班岗位"
          ><n-select
            v-model:value="overtimeForm.positionId"
            :options="positionOptions"
        /></n-form-item>
        <n-form-item label="加班班次"
          ><n-select
            v-model:value="overtimeForm.shiftId"
            :options="shiftOptions"
        /></n-form-item>
        <n-form-item label="备注"
          ><n-input
            v-model:value="overtimeForm.note"
            type="textarea"
            maxlength="500"
        /></n-form-item>
      </n-form>
      <template #footer
        ><n-space justify="space-between"
          ><n-button
            v-if="overtimeForm.assignmentId"
            type="error"
            secondary
            :loading="saving"
            @click="removeOvertime"
            >删除加班</n-button
          ><span v-else /><n-space
            ><n-button @click="overtimeOpen = false">取消</n-button
            ><n-button
              type="warning"
              :loading="saving"
              :disabled="!overtimeForm.positionId || !overtimeForm.shiftId"
              @click="saveOvertime"
              >保存加班</n-button
            ></n-space
          ></n-space
        ></template
      >
    </n-modal>

    <n-modal
      v-model:show="batchOpen"
      preset="card"
      title="批量套用排班"
      class="wide-modal"
    >
      <n-form label-placement="top">
        <n-form-item label="排班方式">
          <n-radio-group v-model:value="batchMode">
            <n-radio-button value="ROTATION">白白夜夜休休</n-radio-button>
            <n-radio-button value="SINGLE">固定班次铺满</n-radio-button>
          </n-radio-group>
        </n-form-item>
        <n-alert v-if="batchMode === 'ROTATION'" type="info" :bordered="false">
          请按第 1、2、3 组的顺序选择 3 名同岗位员工，系统会自动错开 0、2、4
          天，形成三班轮换。
        </n-alert>
        <n-form-item label="员工 / 岗位">
          <n-select
            v-model:value="batchEmploymentIds"
            multiple
            filterable
            :options="employmentOptions"
            placeholder="选择需要套用的员工"
          />
        </n-form-item>
        <template v-if="batchMode === 'ROTATION'">
          <n-form-item label="白班（12 小时）"
            ><n-select v-model:value="dayShiftId" :options="shiftOptions"
          /></n-form-item>
          <n-form-item label="夜班（12 小时，跨日）"
            ><n-select v-model:value="nightShiftId" :options="shiftOptions"
          /></n-form-item>
        </template>
        <n-form-item v-else label="固定班次"
          ><n-select v-model:value="singleShiftId" :options="shiftOptions"
        /></n-form-item>
        <n-alert type="warning" :bordered="false">
          批量套用会覆盖所选员工在本周期内的普通排班，不会覆盖加班。已有考勤或锁定记录时系统会拒绝操作。
        </n-alert>
      </n-form>
      <template #footer
        ><n-space justify="end"
          ><n-button @click="batchOpen = false">取消</n-button
          ><n-button
            type="primary"
            :loading="saving"
            :disabled="batchDisabled"
            @click="applyBatch"
            >确认套用</n-button
          ></n-space
        ></template
      >
    </n-modal>

    <n-modal
      v-model:show="shiftOpen"
      preset="card"
      title="本店班次设置"
      class="wide-modal"
    >
      <n-alert type="info" :bordered="false">
        吧员、机动岗建议设置 10 小时班次，客服建议设置 8
        小时班次；具体上班时间由本店高峰期决定。
      </n-alert>
      <div class="shift-list">
        <div
          v-for="shift in options?.shifts || []"
          :key="shift.id"
          class="shift-item"
        >
          <span
            ><strong>{{ shift.name }}</strong
            ><small
              >{{ shift.startsAt }} — {{ shift.spansNextDay ? '次日 ' : ''
              }}{{ shift.endsAt }}</small
            ></span
          >
          <n-space
            ><n-button size="tiny" @click="editShift(shift)">修改</n-button
            ><n-popconfirm @positive-click="disableShift(shift.id)"
              ><template #trigger
                ><n-button size="tiny" type="error" secondary
                  >停用</n-button
                ></template
              >停用后不再用于新排班，历史排班仍保留。</n-popconfirm
            ></n-space
          >
        </div>
      </div>
      <n-divider />
      <n-form label-placement="top">
        <div class="shift-form-grid">
          <n-form-item label="班次名称"
            ><n-input
              v-model:value="shiftForm.name"
              placeholder="如：客服高峰班"
          /></n-form-item>
          <n-form-item label="班次编码"
            ><n-input
              v-model:value="shiftForm.code"
              :disabled="!!shiftForm.id"
              placeholder="如：CS_PEAK"
          /></n-form-item>
          <n-form-item label="开始时间"
            ><n-time-picker
              v-model:formatted-value="shiftForm.startsAt"
              value-format="HH:mm"
              format="HH:mm"
          /></n-form-item>
          <n-form-item label="结束时间"
            ><n-time-picker
              v-model:formatted-value="shiftForm.endsAt"
              value-format="HH:mm"
              format="HH:mm"
          /></n-form-item>
        </div>
        <n-checkbox v-model:checked="shiftForm.spansNextDay"
          >结束时间在次日</n-checkbox
        >
      </n-form>
      <template #footer
        ><n-space justify="space-between"
          ><n-button @click="resetShiftForm">清空</n-button
          ><n-button
            type="primary"
            :loading="saving"
            :disabled="shiftDisabled"
            @click="saveShift"
            >保存班次</n-button
          ></n-space
        ></template
      >
    </n-modal>

    <n-modal
      v-model:show="successionOpen"
      preset="card"
      title="排班工作继承"
      class="wide-modal"
    >
      <n-alert type="info" :bordered="false"
        >员工离职后，可将其原排班从指定日期起交给新员工。后续复制上月排班时会自动替换，无需重新逐日排班。</n-alert
      >
      <div v-if="options?.successions.length" class="succession-list">
        <div
          v-for="item in options.successions"
          :key="item.id"
          class="succession-item"
        >
          <span
            ><strong>{{
              formerEmployeeName(item.predecessorEmployeeId)
            }}</strong
            ><b>→</b
            ><strong>{{
              item.successorEmployment?.employee.name || '已失效员工'
            }}</strong
            ><small>{{ shortDate(item.effectiveFrom) }} 起生效</small></span
          >
          <n-popconfirm @positive-click="removeSuccession(item.id)"
            ><template #trigger
              ><n-button size="tiny" type="error" secondary
                >删除</n-button
              ></template
            >确认删除该工作继承？</n-popconfirm
          >
        </div>
      </div>
      <n-divider />
      <n-form label-placement="top">
        <n-form-item label="原员工"
          ><n-select
            v-model:value="successionForm.predecessorEmployeeId"
            filterable
            :options="formerEmployeeOptions"
            placeholder="选择有历史排班的员工"
        /></n-form-item>
        <n-form-item label="接班员工 / 岗位"
          ><n-select
            v-model:value="successionForm.successorEmploymentId"
            filterable
            :options="employmentOptions"
            placeholder="选择当前在岗员工"
        /></n-form-item>
        <n-form-item label="生效日期"
          ><n-date-picker
            v-model:formatted-value="successionForm.effectiveFrom"
            value-format="yyyy-MM-dd"
            type="date"
        /></n-form-item>
      </n-form>
      <template #footer
        ><n-space justify="end"
          ><n-button @click="successionOpen = false">关闭</n-button
          ><n-button
            type="primary"
            :loading="saving"
            :disabled="successionDisabled"
            @click="saveSuccession"
            >保存工作继承</n-button
          ></n-space
        ></template
      >
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  NCheckbox,
  NDivider,
  NInput,
  NPopconfirm,
  NRadioButton,
  NRadioGroup,
  NTimePicker,
  useDialog,
  useMessage
} from 'naive-ui';
import { NSelect } from '@/components/Select';
import {
  applyV2ScheduleCycle,
  copyPreviousV2Schedule,
  createV2ScheduleAssignment,
  deleteV2ScheduleAssignment,
  deleteV2ScheduleSuccession,
  deleteV2StoreShift,
  getV2Schedule,
  getV2ScheduleOptions,
  inheritV2Shifts,
  lockV2Schedule,
  publishV2Schedule,
  saveV2StoreShift,
  saveV2ScheduleSuccession,
  updateV2ScheduleAssignment,
  type V2ScheduleDetail,
  type V2ScheduleOptions
} from '@/api/v2-operations';
import { storeDisplayName } from '@/utils/store-display';
import { useAuthStore } from '@/stores/auth';

type Assignment = V2ScheduleDetail['assignments'][number];
type Employment = V2ScheduleOptions['employments'][number];
const route = useRoute();
const router = useRouter();
const message = useMessage();
const dialog = useDialog();
const auth = useAuthStore();
const schedule = ref<V2ScheduleDetail | null>(null);
const options = ref<V2ScheduleOptions | null>(null);
const loading = ref(false);
const saving = ref(false);
const viewMode = ref<'WEEK' | 'MONTH'>('WEEK');
const weekStart = ref(0);
const cellOpen = ref(false);
const overtimeOpen = ref(false);
const batchOpen = ref(false);
const shiftOpen = ref(false);
const successionOpen = ref(false);
const batchMode = ref<'ROTATION' | 'SINGLE'>('ROTATION');
const batchEmploymentIds = ref<string[]>([]);
const dayShiftId = ref<string | null>(null);
const nightShiftId = ref<string | null>(null);
const singleShiftId = ref<string | null>(null);
const cellForm = reactive({
  assignmentId: '',
  employmentId: '',
  employeeId: '',
  positionId: '',
  workDate: '',
  shiftValue: '',
  note: '',
  isRest: false
});
const overtimeForm = reactive({
  assignmentId: '',
  positionId: '',
  shiftId: '',
  note: ''
});
const shiftForm = reactive<{
  id: string;
  name: string;
  code: string;
  startsAt: string | null;
  endsAt: string | null;
  spansNextDay: boolean;
}>({
  id: '',
  name: '',
  code: '',
  startsAt: null,
  endsAt: null,
  spansNextDay: false
});
const successionForm = reactive({
  predecessorEmployeeId: '',
  successorEmploymentId: '',
  effectiveFrom: ''
});

const statusText = computed(
  () =>
    ({ DRAFT: '草稿', PUBLISHED: '已发布', LOCKED: '已锁定' })[
      schedule.value?.status || ''
    ] || ''
);
const canManage = computed(() =>
  Boolean(
    auth.user?.roles.includes('super_admin') ||
    auth.user?.permissions.includes('schedule:update')
  )
);
const statusType = computed(() =>
  schedule.value?.status === 'LOCKED'
    ? 'warning'
    : schedule.value?.status === 'PUBLISHED'
      ? 'success'
      : 'default'
);
const allDates = computed(() => {
  if (!schedule.value) return [];
  const dates: string[] = [];
  const end = new Date(schedule.value.endsOn);
  for (
    const date = new Date(schedule.value.startsOn);
    date <= end;
    date.setUTCDate(date.getUTCDate() + 1)
  )
    dates.push(date.toISOString().slice(0, 10));
  return dates;
});
const visibleDates = computed(() =>
  viewMode.value === 'MONTH'
    ? allDates.value
    : allDates.value.slice(weekStart.value, weekStart.value + 7)
);
const employeeRows = computed(() => options.value?.employments ?? []);
const regularAssignments = computed(
  () => schedule.value?.assignments.filter((item) => !item.overtime) ?? []
);
const assignmentMap = computed(
  () =>
    new Map(
      regularAssignments.value.map((item) => [
        `${item.employee.id}:${item.workDate.slice(0, 10)}`,
        item
      ])
    )
);
const overtimeMap = computed(
  () =>
    new Map(
      (schedule.value?.assignments.filter((item) => item.overtime) ?? []).map(
        (item) => [`${item.employee.id}:${item.workDate.slice(0, 10)}`, item]
      )
    )
);
const workCount = computed(
  () => regularAssignments.value.filter((item) => !item.isRest).length
);
const restCount = computed(
  () => regularAssignments.value.filter((item) => item.isRest).length
);
const applicableSlotCount = computed(() =>
  employeeRows.value.reduce(
    (total, employment) =>
      total +
      allDates.value.filter((date) => employmentActiveOn(employment, date))
        .length,
    0
  )
);
const missingCount = computed(() =>
  Math.max(0, applicableSlotCount.value - regularAssignments.value.length)
);
const shiftOptions = computed(
  () =>
    options.value?.shifts.map((item) => ({
      label: `${item.name} ${item.startsAt}–${item.spansNextDay ? '次日 ' : ''}${item.endsAt}`,
      value: item.id
    })) ?? []
);
const cellShiftOptions = computed(() => [
  { label: '休息', value: 'REST' },
  ...shiftOptions.value
]);
const employmentOptions = computed(() =>
  employeeRows.value.map((item) => ({
    label: `${item.employee.name} · ${item.position.name}`,
    value: item.id
  }))
);
const positionOptions = computed(
  () =>
    options.value?.positions.map((item) => ({
      label: item.name,
      value: item.id
    })) ?? []
);
const formerEmployeeOptions = computed(
  () =>
    options.value?.formerEmployees.map((item) => ({
      label: `${item.name} · ${item.employeeNo}`,
      value: item.id
    })) ?? []
);
const cellEmployeeLabel = computed(
  () =>
    employmentOptions.value.find((item) => item.value === cellForm.employmentId)
      ?.label ?? ''
);
const weekLabel = computed(() =>
  visibleDates.value.length
    ? `${visibleDates.value[0].slice(5)} 至 ${visibleDates.value.at(-1)?.slice(5)}`
    : ''
);
const batchDisabled = computed(
  () =>
    !batchEmploymentIds.value.length ||
    (batchMode.value === 'ROTATION'
      ? batchEmploymentIds.value.length !== 3 ||
        !dayShiftId.value ||
        !nightShiftId.value
      : !singleShiftId.value)
);
const shiftDisabled = computed(
  () =>
    !shiftForm.name.trim() ||
    !shiftForm.code.trim() ||
    !shiftForm.startsAt ||
    !shiftForm.endsAt ||
    shiftForm.startsAt === shiftForm.endsAt
);
const successionDisabled = computed(
  () =>
    !successionForm.predecessorEmployeeId ||
    !successionForm.successorEmploymentId ||
    !successionForm.effectiveFrom
);

function shortDate(value: string) {
  return value.slice(0, 10);
}
function dayNumber(value: string) {
  return String(Number(value.slice(8, 10)));
}
function weekday(value: string) {
  return ['日', '一', '二', '三', '四', '五', '六'][
    new Date(`${value}T00:00:00Z`).getUTCDay()
  ];
}
function isWeekend(value: string) {
  return [0, 6].includes(new Date(`${value}T00:00:00Z`).getUTCDay());
}
function cellFor(employeeId: string, date: string) {
  return assignmentMap.value.get(`${employeeId}:${date}`);
}
function overtimeFor(employeeId: string, date: string) {
  return overtimeMap.value.get(`${employeeId}:${date}`);
}
function employeeRestCount(employeeId: string) {
  return regularAssignments.value.filter(
    (item) => item.employee.id === employeeId && item.isRest
  ).length;
}
function positionRestTarget(positionName: string) {
  return /(吧员|机动|客服)/.test(positionName);
}
function employmentActiveOn(employment: Employment, date: string) {
  const value = date.slice(0, 10);
  return (
    employment.startedOn.slice(0, 10) <= value &&
    (!employment.endedOn || employment.endedOn.slice(0, 10) >= value)
  );
}
function cellClass(item?: Assignment) {
  if (!item) return 'is-missing';
  if (item.isRest) return 'is-rest';
  const text =
    `${item.shift?.name || ''} ${item.shift?.code || ''}`.toLowerCase();
  if (/night|夜|晚/.test(text)) return 'is-night';
  if (/day|早|白/.test(text)) return 'is-day';
  return 'is-custom';
}

async function load() {
  loading.value = true;
  try {
    schedule.value = await getV2Schedule(String(route.params.id));
    options.value = await getV2ScheduleOptions(schedule.value.storeId);
    const day = options.value.shifts.find((item) =>
      /day|早|白/i.test(`${item.code}${item.name}`)
    );
    const night = options.value.shifts.find((item) =>
      /night|夜|晚/i.test(`${item.code}${item.name}`)
    );
    dayShiftId.value ||= day?.id ?? null;
    nightShiftId.value ||= night?.id ?? null;
    singleShiftId.value ||= options.value.shifts[0]?.id ?? null;
    successionForm.effectiveFrom ||= schedule.value.startsOn.slice(0, 10);
  } finally {
    loading.value = false;
  }
}

function backToStore() {
  if (schedule.value)
    void router.push({
      path: `/v2/stores/${schedule.value.storeId}`,
      query: { tab: 'schedules' }
    });
}
function openCell(employment: Employment, date: string) {
  if (schedule.value?.status === 'LOCKED') return;
  const current = cellFor(employment.employee.id, date);
  Object.assign(cellForm, {
    assignmentId: current?.id ?? '',
    employmentId: employment.id,
    employeeId: employment.employee.id,
    positionId: employment.position.id,
    workDate: date,
    shiftValue: current?.isRest ? 'REST' : (current?.shift?.id ?? ''),
    note: current?.note ?? '',
    isRest: Boolean(current?.isRest)
  });
  cellOpen.value = true;
}
function openAdd() {
  const first = employeeRows.value[0];
  if (!first) return message.warning('本店暂无在岗员工');
  openCell(first, visibleDates.value[0] ?? allDates.value[0]);
}
async function saveCell() {
  if (!schedule.value || !cellForm.shiftValue) return;
  saving.value = true;
  try {
    const body = {
      shiftId: cellForm.shiftValue === 'REST' ? undefined : cellForm.shiftValue,
      isRest: cellForm.shiftValue === 'REST',
      note: cellForm.note
    };
    if (cellForm.assignmentId)
      await updateV2ScheduleAssignment(cellForm.assignmentId, body);
    else
      await createV2ScheduleAssignment({
        periodId: schedule.value.id,
        workDate: cellForm.workDate,
        employeeId: cellForm.employeeId,
        positionId: cellForm.positionId,
        ...body
      });
    cellOpen.value = false;
    await load();
    message.success('排班已保存');
  } finally {
    saving.value = false;
  }
}
async function removeCell() {
  if (!cellForm.assignmentId) return;
  saving.value = true;
  try {
    await deleteV2ScheduleAssignment(cellForm.assignmentId);
    cellOpen.value = false;
    await load();
    message.success('已删除该日安排');
  } finally {
    saving.value = false;
  }
}
function openOvertime() {
  const current = overtimeFor(cellForm.employeeId, cellForm.workDate);
  Object.assign(overtimeForm, {
    assignmentId: current?.id ?? '',
    positionId: current?.position.id ?? cellForm.positionId,
    shiftId: current?.shift?.id ?? '',
    note: current?.note ?? ''
  });
  cellOpen.value = false;
  overtimeOpen.value = true;
}
async function saveOvertime() {
  if (!schedule.value || !overtimeForm.positionId || !overtimeForm.shiftId)
    return;
  saving.value = true;
  try {
    const body = {
      shiftId: overtimeForm.shiftId,
      positionId: overtimeForm.positionId,
      note: overtimeForm.note,
      isRest: false
    };
    if (overtimeForm.assignmentId)
      await updateV2ScheduleAssignment(overtimeForm.assignmentId, body);
    else
      await createV2ScheduleAssignment({
        periodId: schedule.value.id,
        workDate: cellForm.workDate,
        employeeId: cellForm.employeeId,
        overtime: true,
        ...body
      });
    overtimeOpen.value = false;
    await load();
    message.success('加班排班已保存');
  } finally {
    saving.value = false;
  }
}
async function removeOvertime() {
  if (!overtimeForm.assignmentId) return;
  saving.value = true;
  try {
    await deleteV2ScheduleAssignment(overtimeForm.assignmentId);
    overtimeOpen.value = false;
    await load();
    message.success('加班排班已删除');
  } finally {
    saving.value = false;
  }
}
async function applyBatch() {
  if (!schedule.value || batchDisabled.value) return;
  const cycle =
    batchMode.value === 'ROTATION'
      ? [
          dayShiftId.value,
          dayShiftId.value,
          nightShiftId.value,
          nightShiftId.value,
          null,
          null
        ]
      : [singleShiftId.value];
  saving.value = true;
  try {
    await applyV2ScheduleCycle(schedule.value.id, {
      employmentIds: batchEmploymentIds.value,
      cycle,
      stagger: batchMode.value === 'ROTATION'
    });
    batchOpen.value = false;
    await load();
    message.success(
      batchMode.value === 'ROTATION'
        ? '三人错相轮班已生成'
        : '固定班次已生成，请手动标记休息日'
    );
  } finally {
    saving.value = false;
  }
}

function formerEmployeeName(id: string) {
  return (
    options.value?.formerEmployees.find((item) => item.id === id)?.name ??
    '历史员工'
  );
}
function copyPrevious() {
  if (!schedule.value) return;
  dialog.warning({
    title: '复制上月排班',
    content:
      '将覆盖当前草稿中的普通排班与休息安排，已排加班不受影响。如有员工变动，请先设置工作继承。',
    positiveText: '确认复制',
    negativeText: '取消',
    onPositiveClick: async () => {
      await copyPreviousV2Schedule(schedule.value!.id);
      await load();
      message.success('已沿用上一个已发布排班');
    }
  });
}
async function saveSuccession() {
  if (!schedule.value || successionDisabled.value) return;
  saving.value = true;
  try {
    await saveV2ScheduleSuccession(schedule.value.storeId, {
      ...successionForm
    });
    Object.assign(successionForm, {
      predecessorEmployeeId: '',
      successorEmploymentId: '',
      effectiveFrom: schedule.value.startsOn.slice(0, 10)
    });
    await load();
    message.success('工作继承已保存');
  } finally {
    saving.value = false;
  }
}
async function removeSuccession(id: string) {
  if (!schedule.value) return;
  await deleteV2ScheduleSuccession(schedule.value.storeId, id);
  await load();
  message.success('工作继承已删除');
}

function resetShiftForm() {
  Object.assign(shiftForm, {
    id: '',
    name: '',
    code: '',
    startsAt: null,
    endsAt: null,
    spansNextDay: false
  });
}
function editShift(shift: V2ScheduleOptions['shifts'][number]) {
  Object.assign(shiftForm, {
    id: shift.id,
    name: shift.name,
    code: shift.code,
    startsAt: shift.startsAt,
    endsAt: shift.endsAt,
    spansNextDay: shift.spansNextDay
  });
}
async function saveShift() {
  if (!schedule.value || shiftDisabled.value) return;
  saving.value = true;
  try {
    await saveV2StoreShift(schedule.value.storeId, { ...shiftForm });
    resetShiftForm();
    await load();
    message.success('班次已保存');
  } finally {
    saving.value = false;
  }
}
async function disableShift(id: string) {
  if (!schedule.value) return;
  await deleteV2StoreShift(schedule.value.storeId, id);
  await load();
  message.success('班次已停用');
}
async function ensureDefaultShifts() {
  if (!schedule.value || options.value?.shifts.length) return;
  await inheritV2Shifts(schedule.value.storeId);
  await load();
}
function publish() {
  if (!schedule.value) return;
  dialog.warning({
    title: '发布排班',
    content: missingCount.value
      ? `当前仍有 ${missingCount.value} 个未排日（空白不等于休息）。确认继续发布？`
      : '发布后员工可在小程序查看并打卡，仍可在锁定前调整。',
    positiveText: '确认发布',
    negativeText: '取消',
    onPositiveClick: async () => {
      await publishV2Schedule(schedule.value!.id);
      await load();
      message.success('排班已发布');
    }
  });
}
function lock() {
  if (!schedule.value) return;
  dialog.warning({
    title: '锁定排班',
    content: '锁定后本周期及全部排班不可再修改。',
    positiveText: '确认锁定',
    negativeText: '取消',
    onPositiveClick: async () => {
      await lockV2Schedule(schedule.value!.id);
      await load();
    }
  });
}

onMounted(async () => {
  await load();
  await ensureDefaultShifts();
});
</script>

<style scoped>
.schedule-page {
  max-width: none;
}
.schedule-head,
.board-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}
.schedule-head h1 {
  margin: 8px 0 4px;
}
.schedule-head p {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  color: var(--bc-muted);
}
.schedule-metrics {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}
.schedule-metrics small {
  display: block;
  margin-top: 4px;
  color: var(--bc-muted);
  font-size: 11px;
}
.metric-warning strong {
  color: #d67a15 !important;
}
.schedule-board-card {
  overflow: hidden;
}
.board-toolbar {
  margin-bottom: 18px;
}
.week-label {
  min-width: 118px;
  text-align: center;
  color: var(--bc-muted);
  font-size: 13px;
}
.matrix-wrap {
  overflow: auto;
  max-height: calc(100vh - 330px);
  border: 1px solid #e5eaf1;
  border-radius: 12px;
}
.schedule-matrix {
  width: 100%;
  min-width: 860px;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}
.schedule-matrix.monthly {
  min-width: 2600px;
}
.schedule-matrix th,
.schedule-matrix td {
  height: 74px;
  padding: 6px;
  border-right: 1px solid #e8edf3;
  border-bottom: 1px solid #e8edf3;
  text-align: center;
}
.schedule-matrix thead th {
  position: sticky;
  z-index: 3;
  top: 0;
  height: 58px;
  background: #f7f9fc;
  color: #40516a;
}
.schedule-matrix thead th span,
.schedule-matrix thead th small {
  display: block;
}
.schedule-matrix thead th small {
  margin-top: 3px;
  color: #8794a7;
}
.schedule-matrix .employee-column {
  position: sticky;
  z-index: 2;
  left: 0;
  width: 150px;
  min-width: 150px;
  background: #fff;
  text-align: left;
}
.schedule-matrix thead .employee-column {
  z-index: 4;
  background: #f4f7fb;
}
.schedule-matrix .employee-column strong,
.schedule-matrix .employee-column small {
  display: block;
}
.schedule-matrix .employee-column small {
  margin-top: 4px;
  color: #8794a7;
  font-weight: 400;
}
.schedule-matrix .employee-column small b {
  color: #23845e;
  font-weight: 600;
}
.schedule-matrix .employee-column small b.rest-alert {
  color: #d67a15;
}
.schedule-matrix td {
  position: relative;
  cursor: pointer;
  transition: 0.16s ease;
}
.schedule-matrix td:hover {
  outline: 2px solid #6e99d6;
  outline-offset: -2px;
}
.cell-name {
  display: block;
  overflow: hidden;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.schedule-matrix td small {
  display: block;
  margin-top: 4px;
  opacity: 0.72;
}
.is-day {
  background: #e4f0ff;
  color: #285f9e;
}
.is-night {
  background: #fff0ce;
  color: #8d5a05;
}
.is-custom {
  background: #e5f7ef;
  color: #28775a;
}
.is-rest {
  background: #f1f3f6;
  color: #7d8795;
}
.is-missing {
  background: #fff;
  color: #b5bfcb;
}
.cell-empty {
  font-size: 20px;
  font-weight: 300;
}
.overtime-mark {
  position: absolute;
  top: 4px;
  right: 4px;
  padding: 1px 5px;
  border-radius: 6px;
  background: #ed6c4f;
  color: #fff;
  font-size: 10px;
}
.schedule-matrix td.is-inactive {
  background: repeating-linear-gradient(
    135deg,
    #f7f8fa,
    #f7f8fa 5px,
    #eef1f4 5px,
    #eef1f4 10px
  );
  cursor: not-allowed;
}
.schedule-matrix td.is-inactive:hover {
  outline: 0;
}
.matrix-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-top: 15px;
  color: var(--bc-muted);
  font-size: 12px;
}
.matrix-legend span {
  display: flex;
  align-items: center;
  gap: 7px;
}
.matrix-legend i {
  width: 13px;
  height: 13px;
  border-radius: 4px;
}
.matrix-legend .day {
  background: #dbeaff;
}
.matrix-legend .night {
  background: #ffebbd;
}
.matrix-legend .custom {
  background: #d9f1e6;
}
.matrix-legend .rest {
  background: #e7eaee;
}
.matrix-legend .missing {
  border: 1px solid #d8dee7;
  background: #fff;
}
.wide-modal {
  width: min(780px, 92vw);
}
.shift-list {
  display: grid;
  gap: 9px;
  max-height: 260px;
  margin-top: 16px;
  overflow: auto;
}
.shift-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid #e5eaf1;
  border-radius: 10px;
}
.shift-item span {
  display: grid;
  gap: 3px;
}
.shift-item small {
  color: var(--bc-muted);
}
.shift-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}
.succession-list {
  display: grid;
  gap: 9px;
  max-height: 240px;
  margin-top: 16px;
  overflow: auto;
}
.succession-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid #e5eaf1;
  border-radius: 10px;
}
.succession-item span {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.succession-item b {
  color: #4f7db9;
}
.succession-item small {
  width: 100%;
  color: var(--bc-muted);
}
@media (max-width: 900px) {
  .schedule-head,
  .board-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .schedule-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .shift-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
