<template>
  <div class="page-stack">
    <div class="section-head">
      <div>
        <h1>工资核算</h1>
        <p>门店利润、人员参数、复核审批分权处理；所有关键操作保留审计记录。</p>
      </div>
      <n-space
        ><n-button :loading="loading" @click="load">刷新</n-button
        ><n-button
          v-if="can('finance.payroll:manage')"
          type="primary"
          @click="createOpen = true"
          >新建批次</n-button
        ></n-space
      >
    </div>
    <n-alert type="warning" :bordered="false"
      >工资属于敏感数据。计算、复核、审批必须使用不同账号；进入复核后基础数据将锁定。</n-alert
    >

    <n-card :bordered="false" title="工资批次">
      <n-empty v-if="!batches.length" description="尚无工资批次" />
      <n-data-table
        v-else
        :columns="batchColumns"
        :data="batches"
        :row-key="batchRowKey"
        :row-props="batchRowProps"
      />
    </n-card>

    <template v-if="detail">
      <div class="batch-head">
        <div>
          <h2>{{ monthText(detail.payrollMonth) }} 工资</h2>
          <n-tag :type="statusType(detail.status)">{{
            statusText(detail.status)
          }}</n-tag>
        </div>
        <n-space>
          <n-popconfirm
            v-if="can('finance.payroll:manage') && detail.status !== 'PAID'"
            @positive-click="removeBatch"
          >
            <template #trigger
              ><n-button type="error" secondary :loading="deleting"
                >删除测试批次</n-button
              ></template
            >删除后该批次的门店利润、员工计算结果和审计记录都会一并清除，确定继续？
          </n-popconfirm>
          <n-button
            v-for="action in actions"
            :key="action.status"
            :type="action.primary ? 'primary' : 'default'"
            @click="runTransition(action.status)"
            >{{ action.label }}</n-button
          >
        </n-space>
      </div>

      <n-collapse class="rules-collapse">
        <n-collapse-item name="rules" title="通用参数与计算规则（点击展开）">
          <div class="rules-grid">
            <div
              v-for="rule in payrollRules"
              :key="rule.title"
              class="rule-card"
            >
              <strong>{{ rule.title }}</strong
              ><span>{{ rule.description }}</span
              ><code>{{ rule.formula }}</code>
            </div>
          </div>
        </n-collapse-item>
      </n-collapse>

      <div class="store-payroll-head">
        <div>
          <h3>门店工资试算</h3>
          <p>
            利润数据来自门店经营数据，只读；展开门店可维护关联人员工资参数。
          </p>
        </div>
        <n-button
          v-if="editable && can('finance.payroll:calculate')"
          type="primary"
          :disabled="!employeeInputs.length"
          :loading="calculating"
          @click="calculate"
          >重新计算全部门店</n-button
        >
      </div>
      <n-alert v-if="!canSensitive" type="warning" :bordered="false"
        >当前账号没有个人工资明细权限，仅可查看门店人数与批次流程。</n-alert
      >
      <n-collapse
        v-model:expanded-names="expandedStores"
        accordion
        class="store-payroll-list"
      >
        <n-collapse-item
          v-for="group in storeGroups"
          :key="group.key"
          :name="group.key"
        >
          <template #header>
            <div class="store-summary">
              <div>
                <strong>{{ group.name }}</strong
                ><small v-if="group.profit"
                  >利润目标 ¥{{ money(group.profit.targetProfit) }} · 实际利润
                  ¥{{ money(group.profit.actualProfit) }} · 达成
                  {{ percent(group.profit.achievementRate) }}</small
                >
              </div>
              <div class="store-summary-metrics">
                <span
                  >本月薪资<strong>¥{{ money(group.totalPay) }}</strong></span
                ><span
                  >成员数<strong>{{ group.memberCount }}</strong></span
                ><span
                  >人均薪资<strong>¥{{ money(group.averagePay) }}</strong></span
                >
              </div>
            </div>
          </template>
          <div class="store-detail">
            <n-space justify="end" class="store-actions"
              ><n-button
                v-if="editable && can('finance.payroll:calculate')"
                size="small"
                @click.stop="openEmployee(undefined, group.storeId)"
                >添加关联人员</n-button
              ></n-space
            >
            <n-data-table
              v-if="group.inputs.length"
              :columns="storeEmployeeColumns"
              :data="group.inputs"
              :row-key="employeeRowKey"
              :scroll-x="950"
            />
            <n-empty v-else description="该门店暂无关联人员" />
          </div>
        </n-collapse-item>
      </n-collapse>

      <n-collapse v-if="can('finance.payroll:audit')" class="audit-collapse">
        <n-collapse-item name="audit" title="审计记录">
          <n-timeline
            ><n-timeline-item
              v-for="log in detail.auditLogs || []"
              :key="log.id"
              :title="auditText(log.action)"
              :content="`${log.actorName}${log.reason ? ` · ${log.reason}` : ''}`"
              :time="dateTime(log.createdAt)"
          /></n-timeline>
          <n-empty
            v-if="!detail.auditLogs?.length"
            description="暂无审计记录"
          />
        </n-collapse-item>
      </n-collapse>
    </template>

    <n-modal
      v-model:show="createOpen"
      preset="card"
      title="新建工资批次"
      class="bc-modal-sm"
    >
      <n-form label-placement="top"
        ><n-form-item label="工资月份"
          ><month-grid-picker
            v-model="createForm.month"
            :disabled-months="existingBatchMonths" /></n-form-item
        ><n-form-item label="备注"
          ><n-input
            v-model:value="createForm.notes"
            type="textarea" /></n-form-item
        ><n-form-item label="月薪折算固定天数"
          ><n-input-number
            v-model:value="createForm.monthlyProrationDays"
            :min="1"
            :precision="2"
            class="full" /></n-form-item
      ></n-form>
      <template #footer
        ><n-space justify="end"
          ><n-button @click="createOpen = false">取消</n-button
          ><n-button type="primary" :loading="creating" @click="createBatch"
            >创建</n-button
          ></n-space
        ></template
      >
    </n-modal>

    <n-modal
      v-model:show="employeeOpen"
      preset="card"
      :title="editingEmployeeId ? '编辑员工参数' : '添加员工参数'"
      class="bc-modal-lg"
      content-style="max-height: calc(100svh - 190px); overflow-y: auto;"
    >
      <n-form label-placement="top"
        ><div class="form-grid">
          <n-form-item label="员工"
            ><n-select
              v-model:value="employeeForm.employeeId"
              :disabled="!!editingEmployeeId"
              filterable
              :options="employeeOptions"
          /></n-form-item>
          <n-form-item label="人员类型"
            ><n-select
              v-model:value="employeeForm.employeeType"
              :options="employeeTypeOptions"
          /></n-form-item>
          <n-form-item
            v-if="employeeForm.employeeType !== 'HEAD_OFFICE'"
            label="所属门店"
            ><n-select
              v-model:value="employeeForm.storeId"
              filterable
              :options="storeOptions"
          /></n-form-item>
          <n-form-item
            v-if="employeeForm.employeeType === 'STORE_MANAGER'"
            label="店长等级"
            ><n-select
              v-model:value="employeeForm.grade"
              :options="managerGrades"
          /></n-form-item>
          <template v-if="employeeForm.employeeType === 'HEAD_OFFICE'"
            ><n-form-item label="总部等级"
              ><n-select
                v-model:value="employeeForm.grade"
                :options="hqGrades" /></n-form-item
            ><n-form-item label="岗位类别"
              ><n-select
                v-model:value="employeeForm.category"
                :options="categories" /></n-form-item
          ></template>
          <n-form-item label="应出勤"
            ><n-input-number
              v-model:value="employeeForm.requiredAttendance"
              :min="0" /></n-form-item
          ><n-form-item label="实际出勤"
            ><n-input-number
              v-model:value="employeeForm.actualAttendance"
              :min="0"
          /></n-form-item>
          <n-form-item label="KPI（百分数）"
            ><n-input-number
              v-model:value="employeeForm.kpiScore"
              :min="0" /></n-form-item
          ><n-form-item label="基本工资"
            ><n-input-number v-model:value="employeeForm.baseSalary"
          /></n-form-item>
          <n-form-item label="绩效基数"
            ><n-input-number
              v-model:value="employeeForm.performanceBase" /></n-form-item
          ><n-form-item label="社保补贴"
            ><n-input-number v-model:value="employeeForm.socialSecuritySubsidy"
          /></n-form-item>
          <n-form-item label="职级补贴"
            ><n-input-number
              v-model:value="employeeForm.rankAllowance" /></n-form-item
          ><n-form-item label="餐补/天"
            ><n-input-number v-model:value="employeeForm.mealAllowanceRate"
          /></n-form-item>
          <n-form-item label="化妆补贴"
            ><n-input-number
              v-model:value="employeeForm.makeupAllowance" /></n-form-item
          ><n-form-item label="其他应发（含人工奖励调整）"
            ><n-input-number v-model:value="employeeForm.otherEarnings"
          /></n-form-item>
          <n-form-item label="其他扣款"
            ><n-input-number
              v-model:value="employeeForm.otherDeductions" /></n-form-item
          ><n-form-item label="个人社保"
            ><n-input-number v-model:value="employeeForm.employeeInsurance"
          /></n-form-item>
          <n-form-item label="个人公积金"
            ><n-input-number
              v-model:value="employeeForm.employeeProvidentFund" /></n-form-item
          ><n-form-item label="单位社保"
            ><n-input-number v-model:value="employeeForm.employerInsurance"
          /></n-form-item>
          <n-form-item label="单位公积金"
            ><n-input-number
              v-model:value="employeeForm.employerProvidentFund" /></n-form-item
          ><n-form-item label="个税（人工录入）"
            ><n-input-number v-model:value="employeeForm.incomeTax"
          /></n-form-item>
          <n-form-item label="已发工资"
            ><n-input-number
              v-model:value="employeeForm.alreadyPaid" /></n-form-item
          ><n-form-item label="预支工资"
            ><n-input-number v-model:value="employeeForm.advancePayment"
          /></n-form-item>
          <n-form-item label="试用期"
            ><n-switch v-model:value="employeeForm.probationary" /></n-form-item
          ><n-form-item label="全勤"
            ><n-switch v-model:value="employeeForm.fullAttendance"
          /></n-form-item>
          <n-form-item label="人工确认出勤门槛"
            ><n-select
              :value="
                employeeForm.attendanceOverride == null
                  ? null
                  : employeeForm.attendanceOverride ? 'qualified' : 'unqualified'
              "
              @update:value="setAttendanceOverride"
              clearable
              placeholder="自动判断"
              :options="overrideOptions"
          /></n-form-item>
          <n-form-item
            v-if="
              employeeForm.attendanceOverride !== undefined &&
              employeeForm.attendanceOverride !== null
            "
            label="人工确认原因"
            ><n-input v-model:value="employeeForm.attendanceOverrideReason"
          /></n-form-item></div
      ></n-form>
      <template #footer
        ><n-space justify="end"
          ><n-button @click="employeeOpen = false">取消</n-button
          ><n-button type="primary" @click="saveEmployee"
            >保存参数</n-button
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
  NDataTable,
  NButton,
  NPopconfirm,
  NTag,
  useMessage,
  type DataTableColumns,
  NTimeline,
  NTimelineItem
} from 'naive-ui';
import { NSelect } from '@/components/Select';
import { useAuthStore } from '@/stores/auth';
import MonthGridPicker from '@/components/MonthGridPicker.vue';
import {
  getV2Employees,
  getV2EmployeePayrollProfiles,
  getV2MasterDataOverview,
  type V2EmployeeItem,
  type V2EmployeePayrollProfile,
  type V2MasterDataOverview
} from '@/api/v2-master-data';
import {
  calculatePayrollBatch,
  createPayrollBatch,
  deletePayrollBatch,
  getPayrollBatch,
  getPayrollBatches,
  transitionPayrollBatch,
  type PayrollBatchDetail,
  type PayrollBatchListItem,
  type PayrollEmployeeInput,
  type PayrollEmployeeResult,
  type PayrollStatus
} from '@/api/v2-finance';

const auth = useAuthStore();
const message = useMessage();
const loading = ref(false),
  creating = ref(false),
  calculating = ref(false),
  deleting = ref(false),
  createOpen = ref(false),
  employeeOpen = ref(false);
const batches = ref<PayrollBatchListItem[]>([]),
  detail = ref<PayrollBatchDetail | null>(null),
  stores = ref<V2MasterDataOverview['stores']>([]),
  employees = ref<V2EmployeeItem[]>([]),
  payrollProfiles = ref<V2EmployeePayrollProfile[]>([]);
const employeeInputs = ref<PayrollEmployeeInput[]>([]),
  editingEmployeeId = ref('');
const expandedStores = ref<string[]>([]);
const createForm = reactive({
  month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
  notes: '',
  monthlyProrationDays: 26
});
const blankEmployee = (): PayrollEmployeeInput => ({
  employeeId: '',
  employeeType: 'STORE_STAFF',
  requiredAttendance: 0,
  actualAttendance: 0,
  kpiScore: 100,
  baseSalary: 0,
  performanceBase: 0,
  socialSecuritySubsidy: 0,
  rankAllowance: 0,
  mealAllowanceRate: 0,
  makeupAllowance: 0,
  otherEarnings: 0,
  otherDeductions: 0,
  employeeInsurance: 0,
  employeeProvidentFund: 0,
  employerInsurance: 0,
  employerProvidentFund: 0,
  incomeTax: 0,
  alreadyPaid: 0,
  advancePayment: 0,
  probationary: false,
  fullAttendance: false
});
const employeeForm = reactive<PayrollEmployeeInput>(blankEmployee());
type ProfitRow = {
  storeId: string;
  storeName: string;
  targetProfit: number;
  actualProfit: number;
  includedInHeadOffice: boolean;
  exclusionReason: string;
  achievementRate: number;
  bonusPool: number;
};
const profitRows = ref<ProfitRow[]>([]);
const payrollRules = [
  {
    title: '可调基础参数',
    description:
      '应出勤、实际出勤、KPI、基本工资、绩效基数、试用期、全勤、社保补贴、职级补贴、餐补/天、化妆补贴、调整分、其他应发和其他扣款。',
    formula: '所有人工调整随员工保存在本批次快照中'
  },
  {
    title: '可调扣缴参数',
    description:
      '个人社保、个人公积金、单位社保、单位公积金、个税、已发工资和预支工资。个税现阶段人工录入。',
    formula: '单位成本 = 应发工资 + 单位社保 + 单位公积金'
  },
  {
    title: '工资出勤比例',
    description: '所有人员工资计发比例最高100%，超过部分换算调休。',
    formula: '计发比例 = min(实际出勤 ÷ 应出勤, 100%)'
  },
  {
    title: '普通员工绩效',
    description: '普通员工KPI不封顶，按录入分数直接计算。',
    formula: '绩效工资 = 绩效基数 × KPI% × 计发比例'
  },
  {
    title: '店长绩效',
    description: '店长KPI最高100%，结合本门店利润达成率，综合绩效最高150%。',
    formula: '综合绩效 = min(KPI×20% + 利润达成率×80% + 调整分, 150%)'
  },
  {
    title: '店长P级工资表',
    description: '依次为基本工资/绩效基数；P2-P4试用期按80%，P0-P1不打折。',
    formula:
      'P0 2000/4000；P1 2400/4600；P2 3000/5200；P3 3400/5700；P4 4100/6750'
  },
  {
    title: '总部绩效',
    description: '总部KPI最高100%，利润指标取纳入门店平均达成率。',
    formula: '一/二/三类KPI权重20%/50%/80%，剩余权重为利润指标'
  },
  {
    title: '总部M级基本工资',
    description:
      'M2-M6试用期按80%，M0-M1不打折；绩效基数再按一/二/三类岗位选择。',
    formula: 'M0 1400；M1 2500；M2 3000；M3 3500；M4 4000；M5 5000；M6 7000'
  },
  {
    title: '总部一/二/三类绩效基数',
    description: '各M级依次列出一类/二类/三类绩效基数。',
    formula:
      'M0 1600/1600/1600；M1 3000/2600/2300；M2 4800/4300/3800；M3 6600/5800/5000；M4 8200/7700/7000；M5 10000/9000/8000；M6 12000/10000/9000'
  },
  {
    title: '利润达成率',
    description:
      '利润目标和实际利润来自门店经营数据，只读。未达目标时按目标区间对应的两段差额折算，最低0%、最高100%。',
    formula: '目标≤3万：2万+2万；≤6万：3万+3万；≤10万：4万+2万；>10万：5万+3万'
  },
  {
    title: '超额利润奖励池',
    description: '店长20%、门店伙伴30%、总部50%。',
    formula: '前30,000×30% + 超出30,000部分×45%'
  },
  {
    title: '职级补贴门槛',
    description: '跨岗位、跨门店合并判断，支持人工确认并留痕。',
    formula: '实际出勤 ÷ 应出勤 ≥ 70%'
  },
  {
    title: '社保补贴',
    description: '都江堰使用第二套方案，其他门店使用第一套方案，并按出勤封顶。',
    formula: '补贴实发 = 补贴标准 × 计发比例'
  },
  {
    title: '应发与实发',
    description: '个税人工录入，保留其他应发和其他扣款。',
    formula: '实发 = 应发 - 个人社保 - 个人公积金 - 个税 - 已发 - 预支'
  }
];
const can = (code: string) =>
  !!auth.user?.roles.includes('super_admin') ||
  !!auth.user?.permissions.includes(code);
const existingBatchMonths = computed(() =>
  batches.value.map((item) => item.payrollMonth.slice(0, 7))
);
const canSensitive = computed(() => can('finance.payroll:view_sensitive'));
const editable = computed(
  () => !!detail.value && ['DRAFT', 'CALCULATED'].includes(detail.value.status)
);
const storeOptions = computed(() =>
  stores.value.map((x) => ({ label: x.shortName || x.name, value: x.id }))
);
const employeeOptions = computed(() =>
  employees.value
    .filter(
      (x) =>
        !employeeInputs.value.some((y) => y.employeeId === x.id) ||
        x.id === editingEmployeeId.value
    )
    .map((x) => ({ label: `${x.name}（${x.employeeNo}）`, value: x.id }))
);
const employeeTypeOptions = [
  { label: '门店普通员工', value: 'STORE_STAFF' },
  { label: '门店店长', value: 'STORE_MANAGER' },
  { label: '总部人员', value: 'HEAD_OFFICE' }
];
const managerGrades = ['P0', 'P1', 'P2', 'P3', 'P4'].map((value) => ({
    label: value,
    value
  })),
  hqGrades = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6'].map((value) => ({
    label: value,
    value
  })),
  categories = ['一类', '二类', '三类'].map((value) => ({
    label: value,
    value
  }));
const overrideOptions = [
  { label: '人工确认符合', value: 'qualified' },
  { label: '人工确认不符合', value: 'unqualified' }
];
function setAttendanceOverride(value: string | null) {
  employeeForm.attendanceOverride = value === null ? undefined : value === 'qualified';
}

const statusMap: Record<PayrollStatus, string> = {
  DRAFT: '草稿',
  CALCULATED: '已计算',
  PENDING_REVIEW: '待复核',
  REVIEWED: '已复核',
  APPROVED: '已审批',
  LOCKED: '已锁定',
  PAID: '已发放',
  CANCELLED: '已取消'
};
const statusText = (s: PayrollStatus) => statusMap[s],
  statusType = (s: PayrollStatus) =>
    s === 'PAID'
      ? 'success'
      : s === 'CANCELLED'
        ? 'error'
        : s === 'DRAFT'
          ? 'default'
          : 'info';
const monthText = (v: string) =>
    new Date(v).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' }),
  dateTime = (v: string) => new Date(v).toLocaleString('zh-CN');
const money = (v: unknown) =>
    Number(v || 0).toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }),
  percent = (v: unknown) => `${(Number(v || 0) * 100).toFixed(2)}%`;
const employeeName = (id: string) =>
  employees.value.find((x) => x.id === id)?.name || id;

const batchColumns: DataTableColumns<PayrollBatchListItem> = [
  {
    title: '月份',
    key: 'payrollMonth',
    render: (r) => monthText(r.payrollMonth)
  },
  {
    title: '状态',
    key: 'status',
    render: (r) =>
      h(NTag, { type: statusType(r.status) }, () => statusText(r.status))
  },
  { title: '公式版本', key: 'formulaVersion' },
  { title: '备注', key: 'notes', render: (r) => r.notes || '-' },
  {
    title: '操作',
    key: 'actions',
    render: (r) =>
      h(
        NButton,
        {
          size: 'small',
          type: detail.value?.id === r.id ? 'primary' : 'default',
          onClick: () => selectBatch(r.id)
        },
        () => (detail.value?.id === r.id ? '当前批次' : '进入核算')
      )
  }
];
const batchRowProps = (row: PayrollBatchListItem) => ({
  style: 'cursor:pointer',
  onDblclick: () => selectBatch(row.id)
});
const batchRowKey = (row: PayrollBatchListItem) => row.id;
const employeeRowKey = (row: PayrollEmployeeInput) => row.employeeId;
const resultByEmployee = computed(
  () =>
    new Map(
      (detail.value?.employeeResults || []).map((item) => [
        item.employeeId,
        item
      ])
    )
);
const storeGroups = computed(() => {
  const groups = stores.value.map((store) => {
    const inputs = employeeInputs.value.filter(
      (item) => item.storeId === store.id
    );
    const results = inputs
      .map((item) => resultByEmployee.value.get(item.employeeId))
      .filter(Boolean) as PayrollEmployeeResult[];
    const totalPay = results.reduce(
      (sum, item) => sum + Number(item.netPay),
      0
    );
    return {
      key: store.id,
      storeId: store.id as string | undefined,
      name: store.shortName || store.name,
      profit: profitRows.value.find((item) => item.storeId === store.id),
      inputs,
      totalPay,
      memberCount: inputs.length,
      averagePay: inputs.length ? totalPay / inputs.length : 0
    };
  });
  const inputs = employeeInputs.value.filter(
    (item) => item.employeeType === 'HEAD_OFFICE'
  );
  if (inputs.length) {
    const results = inputs
      .map((item) => resultByEmployee.value.get(item.employeeId))
      .filter(Boolean) as PayrollEmployeeResult[];
    const totalPay = results.reduce(
      (sum, item) => sum + Number(item.netPay),
      0
    );
    groups.push({
      key: 'HEAD_OFFICE',
      storeId: undefined,
      name: '总部办公室',
      profit: undefined,
      inputs,
      totalPay,
      memberCount: inputs.length,
      averagePay: inputs.length ? totalPay / inputs.length : 0
    });
  }
  return groups;
});
const storeEmployeeColumns: DataTableColumns<PayrollEmployeeInput> = [
  {
    title: '员工',
    key: 'employeeId',
    fixed: 'left',
    render: (r) => employeeName(r.employeeId)
  },
  {
    title: '类型',
    key: 'employeeType',
    render: (r) =>
      employeeTypeOptions.find((x) => x.value === r.employeeType)?.label ||
      r.employeeType
  },
  {
    title: '等级',
    key: 'grade',
    render: (r) => [r.grade, r.category].filter(Boolean).join(' / ') || '待设置'
  },
  {
    title: '出勤',
    key: 'attendance',
    render: (r) => `${r.actualAttendance}/${r.requiredAttendance || '待设置'}`
  },
  { title: 'KPI', key: 'kpiScore', render: (r) => `${r.kpiScore}%` },
  {
    title: '应发',
    key: 'grossPay',
    render: (r) =>
      `¥${money(resultByEmployee.value.get(r.employeeId)?.grossPay)}`
  },
  {
    title: '实发',
    key: 'netPay',
    render: (r) =>
      h('strong', `¥${money(resultByEmployee.value.get(r.employeeId)?.netPay)}`)
  },
  {
    title: '操作',
    key: 'actions',
    fixed: 'right',
    width: 150,
    render: (r) =>
      h('div', { class: 'row-actions' }, [
        h(
          NButton,
          {
            size: 'small',
            disabled: !editable.value,
            onClick: () => openEmployee(r)
          },
          () => '编辑'
        ),
        h(
          NPopconfirm,
          { onPositiveClick: () => removeEmployee(r.employeeId) },
          {
            trigger: () =>
              h(
                NButton,
                {
                  size: 'small',
                  type: 'error',
                  quaternary: true,
                  disabled: !editable.value
                },
                () => '移除'
              ),
            default: () => '仅从本批次移除，不影响员工档案'
          }
        )
      ])
  }
];
const actions = computed(() => {
  if (!detail.value) return [];
  const s = detail.value.status;
  const all: {
    label: string;
    status: PayrollStatus;
    permission: string;
    primary?: boolean;
  }[] = [];
  if (s === 'CALCULATED')
    all.push({
      label: '提交复核',
      status: 'PENDING_REVIEW',
      permission: 'finance.payroll:calculate',
      primary: true
    });
  if (s === 'PENDING_REVIEW')
    all.push(
      {
        label: '确认复核',
        status: 'REVIEWED',
        permission: 'finance.payroll:review',
        primary: true
      },
      {
        label: '退回计算',
        status: 'CALCULATED',
        permission: 'finance.payroll:review'
      }
    );
  if (s === 'REVIEWED')
    all.push(
      {
        label: '批准工资',
        status: 'APPROVED',
        permission: 'finance.payroll:approve',
        primary: true
      },
      {
        label: '退回复核',
        status: 'PENDING_REVIEW',
        permission: 'finance.payroll:approve'
      }
    );
  if (s === 'APPROVED')
    all.push(
      {
        label: '锁定批次',
        status: 'LOCKED',
        permission: 'finance.payroll:lock',
        primary: true
      },
      {
        label: '退回审批',
        status: 'REVIEWED',
        permission: 'finance.payroll:lock'
      }
    );
  if (s === 'LOCKED')
    all.push({
      label: '确认已发放',
      status: 'PAID',
      permission: 'finance.payroll:pay',
      primary: true
    });
  return all.filter((x) => can(x.permission));
});

async function load() {
  loading.value = true;
  try {
    const [b, m, e] = await Promise.all([
      getPayrollBatches(),
      getV2MasterDataOverview(),
      getV2Employees()
    ]);
    batches.value = b;
    stores.value = m.stores.filter((store) => store.status !== 'CLOSED');
    const activeStoreIds = new Set(stores.value.map((store) => store.id));
    employees.value = e.filter(
      (employee) =>
        !employee.employments.length ||
        employee.employments.some((item) => activeStoreIds.has(item.store.id))
    );
    if (detail.value) await selectBatch(detail.value.id);
  } catch (e) {
    message.error((e as Error).message);
  } finally {
    loading.value = false;
  }
}
async function removeBatch() {
  if (!detail.value) return;
  deleting.value = true;
  try {
    await deletePayrollBatch(detail.value.id);
    detail.value = null;
    profitRows.value = [];
    employeeInputs.value = [];
    message.success('测试工资批次已删除，可重新创建并计算');
    await load();
  } catch (e) {
    message.error((e as Error).message);
  } finally {
    deleting.value = false;
  }
}
async function selectBatch(id: string) {
  try {
    detail.value = await getPayrollBatch(id, canSensitive.value);
    payrollProfiles.value = can('employee.payroll:view')
      ? await getV2EmployeePayrollProfiles(
          detail.value.payrollMonth.slice(0, 7)
        )
      : [];
    const existing = new Map(
      detail.value.storeProfits.map((x) => [x.storeId, x])
    );
    profitRows.value = stores.value.map((s) => {
      const x = existing.get(s.id);
      return {
        storeId: s.id,
        storeName: s.shortName || s.name,
        targetProfit: Number(x?.targetProfit || 0),
        actualProfit: Number(x?.actualProfit || 0),
        includedInHeadOffice: x?.includedInHeadOffice ?? true,
        exclusionReason: x?.exclusionReason || '',
        achievementRate: Number(x?.achievementRate || 0),
        bonusPool: Number(x?.bonusPool || 0)
      };
    });
    const savedInputs = (detail.value.employeeResults || []).map((x) => ({
      ...x.inputSnapshot
    }));
    employeeInputs.value = savedInputs.length
      ? savedInputs
      : employees.value.map((employee) => {
          const employment = employee.employments[0];
          const managerEmployment = employee.organizationEmployments.find(
            (item) => item.position.requiresPGrade
          );
          const profile = payrollProfiles.value.find(
            (item) => item.employeeId === employee.id
          );
          return {
            ...blankEmployee(),
            employeeId: employee.id,
            storeId: employment?.store.id ?? managerEmployment?.costStore?.id,
            employeeType: managerEmployment
              ? ('STORE_MANAGER' as const)
              : employment
                ? ('STORE_STAFF' as const)
                : (profile?.employeeType ?? ('HEAD_OFFICE' as const)),
            grade: managerEmployment?.grade ?? profile?.grade ?? undefined,
            category: profile?.category ?? undefined,
            probationary: profile?.probationary ?? false,
            baseSalary: Number(profile?.baseSalary ?? 0),
            performanceBase: Number(profile?.performanceBase ?? 0),
            socialSecuritySubsidy: Number(profile?.socialSecuritySubsidy ?? 0),
            rankAllowance: Number(profile?.rankAllowance ?? 0),
            mealAllowanceRate: Number(profile?.mealAllowanceRate ?? 0),
            makeupAllowance: Number(profile?.makeupAllowance ?? 0),
            employeeInsurance: Number(profile?.employeeInsurance ?? 0),
            employeeProvidentFund: Number(profile?.employeeProvidentFund ?? 0),
            employerInsurance: Number(profile?.employerInsurance ?? 0),
            employerProvidentFund: Number(profile?.employerProvidentFund ?? 0)
          };
        });
  } catch (e) {
    message.error((e as Error).message);
  }
}
async function createBatch() {
  if (!createForm.month) return message.warning('请选择工资月份');
  creating.value = true;
  try {
    const row = await createPayrollBatch({
      payrollMonth: `${createForm.month}-01`,
      notes: createForm.notes || undefined,
      monthlyProrationDays: createForm.monthlyProrationDays
    });
    createOpen.value = false;
    message.success('工资批次已创建');
    await load();
    await selectBatch(row.id);
  } catch (e) {
    message.error((e as Error).message);
  } finally {
    creating.value = false;
  }
}
function openEmployee(row?: PayrollEmployeeInput, storeId?: string) {
  editingEmployeeId.value = row?.employeeId || '';
  Object.assign(employeeForm, blankEmployee(), row || {});
  if (!row) {
    const first = employees.value.find(
      (x) => !employeeInputs.value.some((y) => y.employeeId === x.id)
    );
    if (first) {
      employeeForm.employeeId = first.id;
      employeeForm.storeId = first.employments[0]?.store.id;
      employeeForm.employeeType = first.employments.some((x) =>
        x.position.name.includes('店长')
      )
        ? 'STORE_MANAGER'
        : 'STORE_STAFF';
    }
    if (storeId) employeeForm.storeId = storeId;
    if (!storeId) employeeForm.employeeType = 'HEAD_OFFICE';
  }
  employeeOpen.value = true;
}
function saveEmployee() {
  if (!employeeForm.employeeId) return message.warning('请选择员工');
  if (employeeForm.employeeType !== 'HEAD_OFFICE' && !employeeForm.storeId)
    return message.warning('请选择所属门店');
  if (employeeForm.employeeType === 'STORE_MANAGER' && !employeeForm.grade)
    return message.warning('请选择店长等级');
  if (
    employeeForm.employeeType === 'HEAD_OFFICE' &&
    (!employeeForm.grade || !employeeForm.category)
  )
    return message.warning('请选择总部等级及岗位类别');
  if (
    employeeForm.attendanceOverride !== undefined &&
    employeeForm.attendanceOverride !== null &&
    !employeeForm.attendanceOverrideReason?.trim()
  )
    return message.warning('人工确认出勤门槛必须填写原因');
  const clean = { ...employeeForm };
  if (clean.employeeType === 'HEAD_OFFICE') delete clean.storeId;
  const index = employeeInputs.value.findIndex(
    (x) => x.employeeId === clean.employeeId
  );
  if (index >= 0) employeeInputs.value[index] = clean;
  else employeeInputs.value.push(clean);
  employeeOpen.value = false;
}
function removeEmployee(id: string) {
  employeeInputs.value = employeeInputs.value.filter(
    (x) => x.employeeId !== id
  );
}
async function calculate() {
  calculating.value = true;
  try {
    const r = await calculatePayrollBatch(
      detail.value!.id,
      employeeInputs.value
    );
    message.success(
      `已计算 ${r.employeeCount} 人，实发合计 ¥${money(r.totals.netPay)}`
    );
    await load();
  } catch (e) {
    message.error((e as Error).message);
  } finally {
    calculating.value = false;
  }
}
async function runTransition(status: PayrollStatus) {
  const rollback =
    ['DRAFT', 'CALCULATED', 'PENDING_REVIEW', 'REVIEWED'].includes(status) &&
    detail.value?.status !== 'DRAFT';
  let reason: string | undefined;
  if (
    rollback &&
    ((detail.value?.status === 'PENDING_REVIEW' && status === 'CALCULATED') ||
      (detail.value?.status === 'REVIEWED' && status === 'PENDING_REVIEW') ||
      (detail.value?.status === 'APPROVED' && status === 'REVIEWED'))
  ) {
    reason = window.prompt('请输入退回原因') || undefined;
    if (!reason) return;
  }
  try {
    await transitionPayrollBatch(detail.value!.id, status, reason);
    message.success(`批次已变更为${statusText(status)}`);
    await load();
  } catch (e) {
    message.error((e as Error).message);
  }
}
const auditText = (action: string) =>
  ({
    STORE_PROFIT_CREATED: '新增门店利润',
    STORE_PROFIT_UPDATED: '更新门店利润',
    PAYROLL_CALCULATED: '计算工资',
    BATCH_STATUS_CHANGED: '变更批次状态'
  })[action] || action;
onMounted(() => void load());
</script>

<style scoped>
.batch-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.batch-head > div {
  display: flex;
  align-items: center;
  gap: 12px;
}
.batch-head h2 {
  margin: 0;
}
.tab-tip {
  margin-bottom: 16px;
}
.rules-collapse,
.audit-collapse {
  padding: 4px 18px;
  background: #fff;
  border-radius: 12px;
}
.rules-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding-bottom: 12px;
}
.rule-card {
  display: grid;
  gap: 7px;
  padding: 14px;
  border: 1px solid #e8ecf2;
  border-radius: 10px;
  background: #fafcff;
}
.rule-card span {
  color: #64748b;
  font-size: 12px;
}
.rule-card code {
  padding: 7px 9px;
  border-radius: 7px;
  background: #eef4ff;
  color: #245ea8;
  font-family: inherit;
  font-size: 12px;
}
.store-payroll-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 18px;
}
.store-payroll-head h3 {
  margin: 0;
}
.store-payroll-head p {
  margin: 5px 0 0;
  color: #64748b;
  font-size: 13px;
}
.store-payroll-list {
  display: grid;
  gap: 10px;
}
.store-payroll-list :deep(.n-collapse-item) {
  padding: 0 16px;
  background: #fff;
  border: 1px solid #e8ecf2;
  border-radius: 12px;
}
.store-summary {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 10px 0;
}
.store-summary > div:first-child {
  display: grid;
  gap: 4px;
}
.store-summary small {
  color: #64748b;
  font-weight: 400;
}
.store-summary-metrics {
  display: flex;
  gap: 26px;
  margin-right: 10px;
}
.store-summary-metrics span {
  display: grid;
  gap: 2px;
  color: #8a94a6;
  font-size: 11px;
  text-align: right;
}
.store-summary-metrics strong {
  color: #172b4d;
  font-size: 15px;
}
.store-detail {
  padding: 0 0 16px;
}
.store-actions {
  margin-bottom: 10px;
}
.profit-grid {
  display: grid;
  gap: 10px;
  margin-bottom: 18px;
}
.profit-row {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) 150px 150px 150px minmax(
      200px,
      1.5fr
    );
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid #eef0f3;
  border-radius: 10px;
}
.computed {
  color: #64748b;
}
.calculate-bar {
  margin-top: 18px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 16px;
}
.row-actions {
  display: flex;
  gap: 4px;
}
@media (max-width: 767px) {
  .batch-head {
    align-items: flex-start;
    flex-direction: column;
  }
  .profit-row {
    grid-template-columns: 1fr;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .rules-grid {
    grid-template-columns: 1fr;
  }
  .store-payroll-head,
  .store-summary {
    align-items: flex-start;
    flex-direction: column;
  }
  .store-summary-metrics {
    width: 100%;
    justify-content: space-between;
    gap: 8px;
  }
  .store-summary-metrics span {
    text-align: left;
  }
}
</style>
