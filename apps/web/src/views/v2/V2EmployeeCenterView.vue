<template>
  <div class="page-stack">
    <div class="section-head">
      <div>
        <h1>员工档案</h1>
        <p>员工档案、门店任职和登录账号统一管理。</p>
      </div>
      <n-space>
        <n-button @click="downloadImportTemplate">下载导入模板</n-button>
        <n-button @click="selectImportFile">导入员工</n-button>
        <input ref="importFileInput" class="hidden-file-input" type="file" accept=".xlsx" @change="uploadImportFile" />
        <n-button type="primary" @click="openEmployee"
          >新增员工</n-button
        ></n-space
      >
    </div>
    <n-card :bordered="false" class="employee-scope-card">
      <div class="employee-scope-toolbar">
        <div>
          <strong>当前人员范围</strong>
          <small>按任职组织查看，兼岗人员会出现在其每个任职组织中</small>
        </div>
        <n-radio-group
          v-if="isSuperAdmin && headOfficeOrganizations.length"
          v-model:value="scopeType"
          @update:value="changeScopeType"
        >
          <n-radio-button value="STORE">门店</n-radio-button>
          <n-radio-button value="ORGANIZATION">总部职能部门</n-radio-button>
        </n-radio-group>
        <n-select
          v-model:value="selectedScopeId"
          :options="scopeOptions"
          filterable
          class="employee-scope-select"
          @update:value="loadScopedEmployees"
        />
      </div>
    </n-card>
    <div class="metric-strip">
      <div>
        <span>{{ selectedScopeLabel }}人数</span
        ><strong>{{ employees.length }}</strong>
      </div>
      <div>
        <span>在职</span
        ><strong>{{
          employees.filter((i) => i.status === 'ACTIVE').length
        }}</strong>
      </div>
      <div>
        <span>已开通账号</span><strong>{{ scopedAccountCount }}</strong>
      </div>
      <div>
        <span>岗位数</span><strong>{{ scopedPositionCount }}</strong>
      </div>
    </div>
    <n-card :title="`${selectedScopeLabel} · 员工与任职`" :bordered="false"
      ><n-empty
        v-if="!employeeLoading && !employees.length"
        description="当前范围暂无员工" /><n-data-table
        v-else
        :loading="employeeLoading"
        :columns="columns"
        :data="employees"
        :row-key="(employee: V2EmployeeItem) => employee.id"
        :pagination="{ pageSize: 20 }"
        :scroll-x="760"
    /></n-card>
    <n-modal
      v-model:show="modalOpen"
      preset="card"
      :title="title"
      class="edit-modal"
      content-style="max-height: calc(100svh - 190px); overflow-y: auto;"
      ><n-form label-placement="top">
        <template v-if="kind === 'employee' || kind === 'editEmployee'"
          ><n-grid :cols="2" :x-gap="12"
            ><n-form-item-gi label="员工编号"
              ><n-input
                v-model:value="form.employeeNo"
                disabled
                placeholder="保存时由系统自动生成" /></n-form-item-gi
            ><n-form-item-gi label="姓名"
              ><n-input v-model:value="form.name" /></n-form-item-gi></n-grid
          ><n-form-item label="手机号（登录用，必填）"
            ><n-input v-model:value="form.phone" /></n-form-item
          ><n-form-item label="入职日期"
            ><n-date-picker
              v-model:formatted-value="form.hiredOn"
              value-format="yyyy-MM-dd"
              type="date"
              class="full" /></n-form-item
          ><template
            v-if="
              kind === 'editEmployee' &&
              selectedEmployee?.organizationEmployments.some(
                (item) => item.position.requiresPGrade
              )
            "
            ><n-divider>店长职级</n-divider>
            <n-grid :cols="2" :x-gap="12"
              ><n-form-item-gi label="P等级"
                ><n-select
                  v-model:value="form.grade"
                  @update:value="gradeChanged = true"
                  :options="managerGrades"
              /></n-form-item-gi>
              <n-form-item-gi label="职级生效日期"
                ><n-date-picker
                  v-model:formatted-value="form.gradeEffectiveOn"
                  value-format="yyyy-MM-dd"
                  type="date"
                  class="full" /></n-form-item-gi></n-grid
            ><n-alert type="info" :bordered="false"
              >P等级调整将记录生效日期，并在工资核算时读取对应P等级标准。</n-alert
            ></template
          ><template v-if="kind === 'editEmployee' && editableAccount">
            <n-divider>登录账号</n-divider>
            <n-form-item label="昵称"><n-input v-model:value="form.loginNickname" placeholder="默认使用员工姓名" /></n-form-item>
            <n-form-item label="账号角色">
              <n-select
                v-model:value="form.loginRoleIds"
                :options="employeeRoleOptions"
                multiple
                filterable
                placeholder="选择账号角色"
                @update:value="roleSelectionChanged = true"
              />
            </n-form-item>
            <n-alert v-if="!editableAccount.usesAccountRoles" type="info">
              当前按岗位授权。选择并保存账号角色后，所选角色适用于该账号的授权门店。
            </n-alert>
          </template
          ><template v-if="kind === 'editEmployee' && canOpenEmployeeAccount">
            <n-divider>登录账号</n-divider>
            <n-checkbox v-model:checked="form.openEmployeeAccount">开通登录账号</n-checkbox>
            <template v-if="form.openEmployeeAccount">
              <n-form-item label="昵称"><n-input v-model:value="form.loginNickname" placeholder="默认使用员工姓名" /></n-form-item>
              <n-form-item label="初始密码">
                <n-input v-model:value="form.loginPassword" type="password" placeholder="至少 8 位" />
              </n-form-item>
              <n-form-item label="账号角色">
                <n-select v-model:value="form.loginRoleIds" :options="employeeRoleOptions" multiple filterable />
              </n-form-item>
            </template>
          </template
          ><template v-if="kind === 'employee'"
            ><n-form-item v-if="isSuperAdmin" label="任职类型"
              ><n-radio-group
                v-model:value="form.assignmentType"
                @update:value="changeAssignmentType"
                ><n-radio-button value="STORE">门店</n-radio-button
                ><n-radio-button value="HEAD_OFFICE"
                  >总部职能</n-radio-button
                ></n-radio-group
              ></n-form-item
            >
            <template v-if="form.assignmentType !== 'HEAD_OFFICE'">
              <n-form-item label="门店"
                ><n-select
                  v-model:value="form.storeId"
                  :options="storeOptions"
                  filterable
                  @update:value="loadPositions" /></n-form-item
              ><n-form-item label="岗位"
                ><n-select
                  v-model:value="form.positionId"
                  :options="positionOptions"
                  :loading="positionLoading"
                  :disabled="!form.storeId || positionLoading"
                  :placeholder="positionPlaceholder"
              /></n-form-item>
              <n-alert v-if="form.storeId && !positionLoading && !positionOptions.length" type="warning" :bordered="false"
                >{{ positionLoadError || '该门店尚未配置可用岗位，请联系管理员在岗位配置中建立或继承岗位。' }}</n-alert
              >
            </template>
            <template v-else>
              <n-form-item label="总部组织"
                ><n-select
                  v-model:value="form.organizationId"
                  :options="headOfficeOptions"
              /></n-form-item>
              <n-form-item label="总部岗位"
                ><n-select
                  v-model:value="form.organizationPositionId"
                  :options="headOfficePositionOptions"
              /></n-form-item> </template
            ><template v-if="form.assignmentType !== 'HEAD_OFFICE'"
              ><n-form-item label="薪酬方式"
                ><n-radio-group v-model:value="form.compensationType"
                  ><n-radio-button value="MONTHLY">月薪制</n-radio-button
                  ><n-radio-button value="HOURLY"
                    >时薪制</n-radio-button
                  ></n-radio-group
                ></n-form-item
              ><n-alert type="info" :bordered="false"
                >工资标准直接读取统一岗位配置，不再生成个人薪资档案。</n-alert
              ></template
            ><template v-if="selectedOrganizationPosition?.requiresPGrade"
              ><n-form-item label="P等级（必选）"
                ><n-select
                  v-model:value="form.grade"
                  :options="managerGrades"
              /></n-form-item>
              <n-form-item label="管理门店（必选）"
                ><n-select
                  v-model:value="form.costStoreId"
                  :options="storeOptions"
                  filterable
              /></n-form-item>
              <n-alert type="warning" :bordered="false"
                >店长属于总部职能岗，仅支持月薪；管理门店用于权限和利润绩效，工资不重复计入门店人工成本。</n-alert
              ></template
            ><template v-if="isSuperAdmin"
              ><n-divider /><n-checkbox
                v-model:checked="form.createLoginAccount"
                >同步开通登录账号</n-checkbox
              ><template v-if="form.createLoginAccount"
                ><n-grid :cols="2" :x-gap="12" class="login-fields"
                  ><n-form-item-gi label="昵称"
                    ><n-input
                      v-model:value="form.loginNickname"
                      placeholder="默认使用员工姓名" /></n-form-item-gi
                  ><n-form-item-gi label="初始密码"
                    ><n-input
                      v-model:value="form.loginPassword"
                      type="password"
                      disabled
                      placeholder="123456" /></n-form-item-gi></n-grid
                ><n-form-item label="账号角色">
                  <n-select v-model:value="form.loginRoleIds" :options="employeeRoleOptions" multiple filterable />
                </n-form-item
                ><small class="account-hint">首次登录必须修改密码。</small
                ></template
              ></template
            >
            <n-divider>入职确认</n-divider>
            <n-alert
              type="success"
              :bordered="false"
              class="onboarding-summary"
            >
              <template v-if="!form.createLoginAccount"
                >本次未同步开通登录账号，入职后可由管理员单独创建。</template
              >
              <template v-else-if="form.phone"
                >登录账号：{{
                  form.phone
                }}　初始密码：<strong>123456</strong>　首次登录强制修改密码</template
              >
              <template v-else
                >填写手机号后将自动作为登录账号，初始密码为
                <strong>123456</strong>。</template
              >
            </n-alert>
          </template></template
        >
        <template v-else-if="kind === 'managerTransfer'"
          ><n-form-item label="目标管理门店"
            ><n-select
              v-model:value="form.managedStoreId"
              :options="storeOptions"
              filterable /></n-form-item
          ><n-form-item label="生效日期"
            ><n-date-picker
              v-model:formatted-value="form.effectiveOn"
              value-format="yyyy-MM-dd"
              type="date"
              class="full" /></n-form-item
          ><n-form-item label="调整原因"
            ><n-input
              v-model:value="form.reason"
              type="textarea" /></n-form-item
          ><n-alert type="info" :bordered="false"
            >仅调整管理门店、账号数据范围和利润绩效归属；岗位、P等级不变，工资不计入门店人工成本。</n-alert
          ></template
        >
        <template v-else-if="kind === 'transfer' || kind === 'employment'"
          ><n-form-item :label="kind === 'employment' ? '兼任门店' : '目标门店'"
            ><n-select
              v-model:value="form.storeId"
              :options="storeOptions"
              @update:value="loadPositions" /></n-form-item
          ><n-form-item label="岗位"
            ><n-select
              v-model:value="form.positionId"
              :options="positionOptions"
              :loading="positionLoading"
              :disabled="!form.storeId || positionLoading"
              :placeholder="positionPlaceholder" /></n-form-item
          ><n-alert v-if="form.storeId && !positionLoading && !positionOptions.length" type="warning" :bordered="false"
            >{{ positionLoadError || '该门店尚未配置可用岗位，请联系管理员在岗位配置中建立或继承岗位。' }}</n-alert
          >
          ><n-form-item label="生效日期"
            ><n-date-picker
              v-model:formatted-value="form.effectiveOn"
              value-format="yyyy-MM-dd"
              type="date"
              class="full" /></n-form-item
          ><n-form-item label="原因"
            ><n-input
              v-model:value="form.reason"
              type="textarea" /></n-form-item
        ></template>
        <template v-else-if="kind === 'leave'"
          ><n-form-item label="门店"
            ><n-select
              v-model:value="form.storeId"
              :options="storeOptions" /></n-form-item
          ><n-form-item label="请假类型"
            ><n-select
              v-model:value="form.type"
              :options="leaveTypeOptions" /></n-form-item
          ><n-grid :cols="2" :x-gap="12"
            ><n-form-item-gi label="开始日期"
              ><n-date-picker
                v-model:formatted-value="form.startsOn"
                value-format="yyyy-MM-dd"
                type="date"
                class="full" /></n-form-item-gi
            ><n-form-item-gi label="结束日期"
              ><n-date-picker
                v-model:formatted-value="form.endsOn"
                value-format="yyyy-MM-dd"
                type="date"
                class="full" /></n-form-item-gi></n-grid
          ><n-form-item label="原因"
            ><n-input
              v-model:value="form.reason"
              type="textarea" /></n-form-item
        ></template>
        <template v-else-if="kind === 'terminate'"
          ><n-form-item label="离职日期"
            ><n-date-picker
              v-model:formatted-value="form.effectiveOn"
              value-format="yyyy-MM-dd"
              type="date"
              class="full" /></n-form-item
          ><n-form-item label="离职原因"
            ><n-input
              v-model:value="form.reason"
              type="textarea" /></n-form-item
        ></template>
        <template v-else-if="kind === 'payroll'">
          <n-alert
            v-if="
              payrollProfileMap.get(selectedEmployee?.id || '')?.source ===
              'TEMPLATE'
            "
            type="info"
            :bordered="false"
          >
            当前数据来自“{{
              payrollProfileMap.get(selectedEmployee?.id || '')?.templateName
            }}”模板。核对后保存，系统才会建立该员工的个人覆盖档案。
          </n-alert>
          <n-grid :cols="2" :x-gap="12">
            <n-form-item-gi label="薪资身份"
              ><n-select
                v-model:value="form.employeeType"
                :options="payrollTypeOptions"
            /></n-form-item-gi>
            <n-form-item-gi
              v-if="form.employeeType !== 'STORE_STAFF'"
              :label="form.employeeType === 'HEAD_OFFICE' ? 'M等级' : 'P等级'"
              ><n-select
                v-model:value="form.grade"
                :options="
                  form.employeeType === 'HEAD_OFFICE' ? hqGrades : managerGrades
                "
                @update:value="applyPayrollGrade"
            /></n-form-item-gi>
          </n-grid>
          <n-form-item
            v-if="form.employeeType === 'HEAD_OFFICE'"
            label="总部岗位类别"
            ><n-select
              v-model:value="form.category"
              :options="categories"
              @update:value="applyPayrollGrade"
          /></n-form-item>
          <n-checkbox v-model:checked="form.probationary">试用期</n-checkbox>
          <n-divider>工资与补贴</n-divider>
          <n-grid :cols="2" :x-gap="12">
            <n-form-item-gi label="基本工资"
              ><n-input-number
                v-model:value="form.baseSalary"
                :min="0" /></n-form-item-gi
            ><n-form-item-gi label="绩效基数"
              ><n-input-number v-model:value="form.performanceBase" :min="0"
            /></n-form-item-gi>
            <n-form-item-gi label="社保补贴方案"
              ><n-select
                v-model:value="form.socialSecurityScheme"
                :options="socialSchemes"
                clearable /></n-form-item-gi
            ><n-form-item-gi label="社保补贴"
              ><n-input-number
                v-model:value="form.socialSecuritySubsidy"
                :min="0"
            /></n-form-item-gi>
            <n-form-item-gi label="职级补贴"
              ><n-input-number
                v-model:value="form.rankAllowance"
                :min="0" /></n-form-item-gi
            ><n-form-item-gi label="餐补/天"
              ><n-input-number v-model:value="form.mealAllowanceRate" :min="0"
            /></n-form-item-gi>
            <n-form-item-gi label="化妆补贴"
              ><n-input-number v-model:value="form.makeupAllowance" :min="0"
            /></n-form-item-gi>
          </n-grid>
          <n-divider>社保与公积金</n-divider>
          <n-grid :cols="2" :x-gap="12">
            <n-form-item-gi label="个人社保"
              ><n-input-number
                v-model:value="form.employeeInsurance"
                :min="0" /></n-form-item-gi
            ><n-form-item-gi label="个人公积金"
              ><n-input-number
                v-model:value="form.employeeProvidentFund"
                :min="0"
            /></n-form-item-gi>
            <n-form-item-gi label="单位社保"
              ><n-input-number
                v-model:value="form.employerInsurance"
                :min="0" /></n-form-item-gi
            ><n-form-item-gi label="单位公积金"
              ><n-input-number
                v-model:value="form.employerProvidentFund"
                :min="0"
            /></n-form-item-gi>
          </n-grid>
          <n-form-item label="生效日期"
            ><n-date-picker
              v-model:formatted-value="form.effectiveFrom"
              value-format="yyyy-MM-dd"
              type="date"
              class="full"
          /></n-form-item>
          <n-form-item label="变更原因"
            ><n-input
              v-model:value="form.reason"
              type="textarea"
              placeholder="首次建档、晋升、转正或薪资调整"
          /></n-form-item>
        </template>
 </n-form
      ><template #footer
        ><n-space justify="end"
          ><n-button @click="modalOpen = false">取消</n-button
          ><n-button type="primary" :loading="saving" @click="save">{{
            kind === 'employee' ? '确认入职' : '保存'
          }}</n-button></n-space
        ></template
      ></n-modal
    ><n-modal v-model:show="importResultOpen" preset="card" title="员工导入结果" class="import-result-modal">
      <n-alert :type="importResult?.failed ? 'warning' : 'success'" :bordered="false">
        执行完成，共执行{{ importResult?.total ?? 0 }}条数据，成功{{ importResult?.success ?? 0 }}条，失败{{ importResult?.failed ?? 0 }}条。
      </n-alert>
      <n-list v-if="groupedImportFailures.length" bordered class="import-failure-list">
        <n-list-item v-for="item in groupedImportFailures" :key="item.reason">
          第{{ item.rows.join('、') }}行执行失败，原因：{{ item.reason }}
        </n-list-item>
      </n-list>
      <template #footer><n-space justify="end"><n-button type="primary" @click="importResultOpen = false">确认</n-button></n-space></template>
    </n-modal
    >
  </div>
</template>
<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import {
  NInputNumber,
  NDataTable,
  NDatePicker,
  NButton,
  NPopconfirm,
  NSpace,
  NTag,
  type DataTableColumns,
  useMessage
} from 'naive-ui';
import { NSelect } from '@/components/Select';
import {
  addV2Employment,
  changeV2ManagerStore,
  changeV2Employment,
  createV2Employee,
  downloadV2EmployeeImportTemplate,
  createV2EmployeeLeave,
  createV2EmployeePayrollProfile,
  getV2AccessControl,
  getV2Employees,
  getV2EmployeePayrollProfiles,
  getV2MasterDataOverview,
  getV2OnboardingPayrollTemplates,
  getV2PayrollProfileTemplates,
  getV2StorePositions,
  importV2Employees,
  resetV2EmployeePassword,
  terminateV2Employee,
  updateV2Employee,
  type V2AccessControl,
  type V2EmployeeItem,
  type V2EmployeePayrollProfile,
  type V2MasterDataOverview,
  type V2EmployeeImportResult,
  type V2PayrollProfileTemplate
} from '@/api/v2-master-data';
import { useAuthStore } from '@/stores/auth';
import { storeDisplayName } from '@/utils/store-display';
const allStoresScope = 'ALL_STORES';
const allEmployeesScope = 'ALL_EMPLOYEES';
const message = useMessage(),
  auth = useAuthStore(),
  isSuperAdmin = computed(
    () => auth.user?.roles.includes('super_admin') === true
  ),
  employees = ref<V2EmployeeItem[]>([]),
  access = ref<V2AccessControl | null>(null),
  master = ref<V2MasterDataOverview | null>(null),
  scopeType = ref<'STORE' | 'ORGANIZATION'>('STORE'),
  selectedScopeId = ref<string>(),
  employeeLoading = ref(false),
  modalOpen = ref(false),
  saving = ref(false),
  positionLoading = ref(false),
  positionLoadError = ref(''),
  kind = ref('employee'),
  form = reactive<Record<string, any>>({}),
  positions = ref<Array<{ id: string; name: string }>>([]),
  selectedEmployee = ref<V2EmployeeItem | null>(null);
const importFileInput = ref<HTMLInputElement>();
const importResultOpen = ref(false);
const importResult = ref<V2EmployeeImportResult | null>(null);
const groupedImportFailures = computed(() => {
  const groups = new Map<string, number[]>();
  for (const item of importResult.value?.failures ?? []) {
    groups.set(item.reason, [...(groups.get(item.reason) ?? []), item.row]);
  }
  return [...groups.entries()].map(([reason, rows]) => ({ reason, rows }));
});
const payrollProfiles = ref<V2EmployeePayrollProfile[]>([]);
const payrollTemplates = ref<V2PayrollProfileTemplate[]>([]);
const canPayrollView = computed(
  () =>
    isSuperAdmin.value ||
    auth.user?.permissions.includes('employee.payroll:view')
);
const title = computed(
    () =>
      ({
        employee: '新增员工',
        editEmployee: `编辑员工 · ${selectedEmployee.value?.name ?? ''}`,
        managerTransfer: `店长调店 · ${selectedEmployee.value?.name ?? ''}`,
        transfer: `调店/调岗 · ${selectedEmployee.value?.name ?? ''}`,
        employment: `新增兼任 · ${selectedEmployee.value?.name ?? ''}`,
        leave: `请假 · ${selectedEmployee.value?.name ?? ''}`,
        terminate: `办理离职 · ${selectedEmployee.value?.name ?? ''}`,
        payroll: `薪资档案 · ${selectedEmployee.value?.name ?? ''}`
      })[kind.value] ?? ''
  ),
  storeOptions = computed(
    () =>
      master.value?.stores.map((i) => ({
        label: storeDisplayName(i),
        value: i.id
      })) ?? []
  ),
  positionOptions = computed(() =>
    positions.value.map((i) => ({ label: i.name, value: i.id }))
  ),
  positionPlaceholder = computed(() =>
    !form.storeId
      ? '请先选择门店'
      : positionLoading.value
        ? '正在加载岗位…'
        : positionOptions.value.length
          ? '请选择岗位'
          : '该门店暂无可用岗位'
  ),
  headOfficeOrganizations = computed(
    () =>
      master.value?.organizations.filter(
        (item) => item.type === 'HEADQUARTERS'
      ) ?? []
  ),
  headOfficeOptions = computed(() =>
    headOfficeOrganizations.value.map((item) => ({
      label: item.name,
      value: item.id
    }))
  ),
  scopeOptions = computed(() => {
    if (scopeType.value === 'ORGANIZATION') return headOfficeOptions.value;
    return [
      ...(isSuperAdmin.value ? [{ label: '全部员工', value: allEmployeesScope }] : []),
      {
        label: isSuperAdmin.value ? '全部门店' : '全部授权门店',
        value: allStoresScope
      },
      ...storeOptions.value
    ];
  }),
  selectedScopeLabel = computed(
    () =>
      scopeOptions.value.find((item) => item.value === selectedScopeId.value)
        ?.label ?? '当前组织'
  ),
  headOfficePositionOptions = computed(() => {
    const organization = headOfficeOrganizations.value.find(
      (item) => item.id === form.organizationId
    );
    return (organization?.positions ?? []).map((item) => ({
      label: item.name,
      value: item.id
    }));
  }),
  selectedOrganizationPosition = computed(() =>
    headOfficeOrganizations.value
      .find((item) => item.id === form.organizationId)
      ?.positions.find((item) => item.id === form.organizationPositionId)
  ),
  leaveTypeOptions = [
    { label: '年假', value: 'ANNUAL' },
    { label: '病假', value: 'SICK' },
    { label: '事假', value: 'PERSONAL' },
    { label: '调休', value: 'COMPENSATORY' },
    { label: '其他', value: 'OTHER' }
  ];
const payrollTypeOptions = [
  { label: '门店普通员工', value: 'STORE_STAFF' },
  { label: '门店店长', value: 'STORE_MANAGER' },
  { label: '总部人员', value: 'HEAD_OFFICE' }
];
const managerGrades = computed(() => gradeOptions('STORE_MANAGER'));
const hqGrades = computed(() => gradeOptions('HEAD_OFFICE'));
const categories = ['一类', '二类', '三类'].map((value) => ({
  label: value,
  value
}));
const socialSchemes = [
  { label: '第一套（其他门店）', value: 'SCHEME_1' },
  { label: '第二套（都江堰）', value: 'SCHEME_2' }
];
const payrollProfileMap = computed(
  () => new Map(payrollProfiles.value.map((item) => [item.employeeId, item]))
);
const employeeAccountMap = computed(
  () =>
    new Map(
      (access.value?.accounts ?? [])
        .filter((account) => account.employee)
        .map((account) => [account.employee!.id, account])
    )
);
const roleSelectionChanged = ref(false);
const gradeChanged = ref(false);
const editableAccount = computed(() => {
  const account = employeeAccountMap.value.get(selectedEmployee.value?.id ?? '');
  return isSuperAdmin.value && account && !account.roles.some(({ role }) => role.code === 'super_admin')
    ? account
    : undefined;
});
const canOpenEmployeeAccount = computed(() =>
  Boolean(isSuperAdmin.value && access.value && selectedEmployee.value &&
    selectedEmployee.value.status !== 'TERMINATED' &&
    !employeeAccountMap.value.has(selectedEmployee.value.id))
);
const employeeRoleOptions = computed(() =>
  (access.value?.roles ?? [])
    .filter((role) => role.enabled && role.code !== 'super_admin')
    .map((role) => ({ label: role.name, value: role.id }))
);
const scopedAccountCount = computed(
  () =>
    employees.value.filter((item) => employeeAccountMap.value.has(item.id))
      .length
);
const scopedPositionCount = computed(
  () =>
    new Set(
      employees.value.flatMap((employee) =>
        scopeType.value === 'STORE'
          ? [
              ...employee.employments
                .filter((item) => [allEmployeesScope, allStoresScope].includes(selectedScopeId.value ?? '') || item.store.id === selectedScopeId.value)
                .map((item) => item.position.id),
              ...employee.organizationEmployments
                .filter((item) => [allEmployeesScope, allStoresScope].includes(selectedScopeId.value ?? '') || item.costStore?.id === selectedScopeId.value)
                .map((item) => item.position.id)
            ]
          : employee.organizationEmployments
              .filter((item) => item.organization.id === selectedScopeId.value)
              .map((item) => item.position.id)
      )
    ).size
);
const columns: DataTableColumns<V2EmployeeItem> = [
  { title: '员工', key: 'name', minWidth: 110 },
  { title: '编号', key: 'employeeNo', width: 110 },
  {
    title: '状态',
    key: 'status',
    width: 90,
    render: (r) =>
      h(
        NTag,
        { type: r.status === 'ACTIVE' ? 'success' : 'default', size: 'small' },
        { default: () => r.status }
      )
  },
  {
    title: '任职门店',
    key: 'store',
    minWidth: 130,
    render: (r) =>
      [
        ...r.employments.map((i) => storeDisplayName(i.store)),
        ...r.organizationEmployments.map((i) =>
          i.costStore
            ? `${i.organization.name}（管理：${storeDisplayName(i.costStore)}）`
            : i.organization.name
        )
      ].join('、') || '-'
  },
  {
    title: '岗位',
    key: 'position',
    minWidth: 100,
    render: (r) =>
      [
        ...r.employments.map((i) => i.position.name),
        ...r.organizationEmployments.map((i) => i.position.name)
      ].join('、') || '-'
  },
  {
    title: '薪酬方式',
    key: 'payrollIdentity',
    minWidth: 120,
    render: (r) => {
      const assignments = [
        ...r.employments.map((item) =>
          item.compensationType === 'HOURLY' ? '时薪制' : '月薪制'
        ),
        ...r.organizationEmployments.map((item) =>
          [item.grade, '月薪制'].filter(Boolean).join(' / ')
        )
      ];
      return [...new Set(assignments)].join('、') || '-';
    }
  },
  {
    title: '登录账号 / 角色',
    key: 'account',
    minWidth: 170,
    render: (r) => {
      const account = employeeAccountMap.value.get(r.id);
      if (!access.value) return '—';
      if (!account) return '未开通';
      return h('div', { class: 'employee-account-cell' }, [
        h('span', `${account.username} · ${account.status}`),
        h(
          'small',
          account.usesAccountRoles
            ? account.roles.map((item) => item.role.name).join('、') || '未分配角色'
            : '随岗位授权'
        )
      ]);
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 320,
    fixed: 'right',
    render: (r) =>
      h(
        NSpace,
        { size: 4 },
        {
          default: () => [
            h(
              NButton,
              { size: 'tiny', onClick: () => openAction('editEmployee', r) },
              { default: () => '编辑' }
            ),
            ...(r.status === 'TERMINATED'
              ? []
              : [
                  ...(r.organizationEmployments.length
                    ? r.organizationEmployments.some(
                        (item) => item.position.requiresPGrade
                      )
                      ? [
                          h(
                            NButton,
                            {
                              size: 'tiny',
                              type: 'primary',
                              secondary: true,
                              onClick: () => openAction('managerTransfer', r)
                            },
                            { default: () => '店长调店' }
                          )
                        ]
                      : []
                    : [
                        h(
                          NButton,
                          {
                            size: 'tiny',
                            onClick: () => openAction('employment', r)
                          },
                          { default: () => '新增兼任' }
                        ),
                        h(
                          NButton,
                          {
                            size: 'tiny',
                            onClick: () => openAction('transfer', r)
                          },
                          { default: () => '调动' }
                        ),
                        h(
                          NButton,
                          {
                            size: 'tiny',
                            onClick: () => openAction('leave', r)
                          },
                          { default: () => '请假' }
                        )
                      ]),
                  h(
                    NButton,
                    {
                      size: 'tiny',
                      type: 'error',
                      secondary: true,
                      onClick: () => openAction('terminate', r)
                    },
                    { default: () => '离职' }
                  )
                ]),
            ...(employeeAccountMap.value.has(r.id)
              ? [
                  h(
                    NPopconfirm,
                    { onPositiveClick: () => resetPassword(r) },
                    {
                      trigger: () =>
                        h(
                          NButton,
                          { size: 'tiny', quaternary: true },
                          { default: () => '重置密码' }
                        ),
                      default: () =>
                        '重置为初始密码 123456？员工下次登录必须修改。'
                    }
                  )
                ]
              : [])
          ]
        }
      )
  }
];
async function load() {
  master.value = await getV2MasterDataOverview();
  const availableOptions = scopeOptions.value;
  if (!availableOptions.some((item) => item.value === selectedScopeId.value)) {
    if (!availableOptions.length && headOfficeOptions.value.length)
      scopeType.value = 'ORGANIZATION';
    selectedScopeId.value = scopeOptions.value[0]?.value;
  }
  const [accessData, profileData, templateData] = await Promise.all([
    isSuperAdmin.value ? getV2AccessControl() : Promise.resolve(null),
    canPayrollView.value ? getV2EmployeePayrollProfiles() : Promise.resolve([]),
    canPayrollView.value
      ? getV2PayrollProfileTemplates()
      : auth.user?.permissions.includes('employee:create')
        ? getV2OnboardingPayrollTemplates()
        : Promise.resolve([])
  ]);
  access.value = accessData;
  payrollProfiles.value = profileData;
  payrollTemplates.value = templateData;
  await loadScopedEmployees();
}
let employeeLoadSequence = 0;
async function loadScopedEmployees() {
  const sequence = ++employeeLoadSequence;
  const scopeId = selectedScopeId.value;
  employees.value = [];
  employeeLoading.value = Boolean(scopeId);
  if (!scopeId) return;
  try {
    const data = await getV2Employees(
      scopeType.value === 'ORGANIZATION'
        ? { organizationId: scopeId }
        : scopeId === allEmployeesScope
          ? undefined
          : scopeId === allStoresScope
          ? { allStores: true }
          : { storeId: scopeId }
    );
    if (sequence === employeeLoadSequence) employees.value = data;
  } catch (error) {
    if (sequence === employeeLoadSequence)
      message.error(error instanceof Error ? error.message : '加载员工失败');
  } finally {
    if (sequence === employeeLoadSequence) employeeLoading.value = false;
  }
}
async function changeScopeType() {
  selectedScopeId.value = scopeOptions.value[0]?.value;
  await loadScopedEmployees();
}
function gradeOptions(type: string) {
  return [
    ...new Set(
      payrollTemplates.value
        .filter((item) => item.employeeType === type)
        .map((item) => item.grade)
        .filter(Boolean)
    )
  ]
    .sort((a, b) =>
      String(a).localeCompare(String(b), undefined, { numeric: true })
    )
    .map((value) => ({ label: String(value), value: String(value) }));
}
function applyPayrollGrade() {
  const template = payrollTemplates.value.find(
    (item) =>
      item.employeeType === form.employeeType &&
      item.grade === form.grade &&
      (form.employeeType !== 'HEAD_OFFICE' || item.category === form.category)
  );
  if (!template) return;
  form.baseSalary = Number(template.baseSalary);
  form.performanceBase = Number(template.performanceBase);
  form.socialSecurityScheme = template.socialSecurityScheme ?? undefined;
  form.socialSecuritySubsidy = Number(template.socialSecuritySubsidy);
  form.rankAllowance = Number(template.rankAllowance);
  form.mealAllowanceRate = Number(template.mealAllowanceRate);
  form.makeupAllowance = Number(template.makeupAllowance);
  form.employeeInsurance = Number(template.employeeInsurance);
  form.employeeProvidentFund = Number(template.employeeProvidentFund);
  form.employerInsurance = Number(template.employerInsurance);
  form.employerProvidentFund = Number(template.employerProvidentFund);
}
function reset(k: string) {
  kind.value = k;
  roleSelectionChanged.value = false;
  gradeChanged.value = false;
  Object.keys(form).forEach((x) => delete form[x]);
  modalOpen.value = true;
}
function openEmployee() {
  reset('employee');
  Object.assign(form, {
    hiredOn: new Date().toISOString().slice(0, 10),
    assignmentType: 'STORE',
    compensationType: 'MONTHLY',
    createLoginAccount: true,
    loginPassword: '123456'
  });
  if (storeOptions.value.length === 1) {
    form.storeId = storeOptions.value[0].value;
    void loadPositions(form.storeId);
  }
}
async function downloadImportTemplate() {
  try {
    const blob = await downloadV2EmployeeImportTemplate();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '员工导入模板.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    message.error(error instanceof Error ? error.message : '导入模板下载失败');
  }
}
function selectImportFile() {
  importFileInput.value?.click();
}
async function uploadImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  employeeLoading.value = true;
  try {
    importResult.value = await importV2Employees(file);
    importResultOpen.value = true;
    await loadScopedEmployees();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '员工导入失败');
  } finally {
    employeeLoading.value = false;
  }
}
function changeAssignmentType(value: string) {
  if (value === 'HEAD_OFFICE') {
    delete form.storeId;
    delete form.positionId;
    const headquarters = headOfficeOrganizations.value[0];
    form.organizationId = headquarters?.id;
    form.organizationPositionId = headquarters?.positions[0]?.id;
    form.compensationType = 'MONTHLY';
  } else {
    delete form.organizationId;
    delete form.organizationPositionId;
  }
}
function openAction(action: string, employee: V2EmployeeItem) {
  selectedEmployee.value = employee;
  reset(action);
  const today = new Date().toISOString().slice(0, 10);
  if (action === 'editEmployee' && editableAccount.value)
    form.loginNickname = editableAccount.value.displayName;
  if (action === 'editEmployee' && editableAccount.value?.usesAccountRoles)
    form.loginRoleIds = editableAccount.value.roles.map(({ role }) => role.id);
  if (action === 'editEmployee')
    Object.assign(form, {
      employeeNo: employee.employeeNo,
      name: employee.name,
      phone: employee.phone ?? '',
      hiredOn: employee.hiredOn?.slice(0, 10) ?? today,
      grade: employee.organizationEmployments.find(
        (item) => item.position.requiresPGrade
      )?.grade,
      gradeEffectiveOn: today
    });
  if (action === 'transfer' || action === 'employment')
    form.effectiveOn = today;
  if (action === 'managerTransfer')
    Object.assign(form, {
      managedStoreId: employee.organizationEmployments.find(
        (item) => item.position.requiresPGrade
      )?.costStore?.id,
      effectiveOn: today,
      reason: ''
    });
  if (action === 'leave')
    Object.assign(form, {
      storeId: employee.employments[0]?.store.id,
      type: 'PERSONAL',
      startsOn: today,
      endsOn: today
    });
  if (action === 'terminate') form.effectiveOn = today;
  if (action === 'payroll') {
    const profile = payrollProfileMap.value.get(employee.id);
    Object.assign(form, {
      employeeType:
        profile?.employeeType ??
        (employee.organizationEmployments.length
          ? 'HEAD_OFFICE'
          : employee.employments.some((item) =>
                item.position.name.includes('店长')
              )
            ? 'STORE_MANAGER'
            : 'STORE_STAFF'),
      grade: profile?.grade ?? undefined,
      category: profile?.category ?? undefined,
      probationary: profile?.probationary ?? false,
      baseSalary: Number(profile?.baseSalary ?? 0),
      performanceBase: Number(profile?.performanceBase ?? 0),
      socialSecurityScheme: profile?.socialSecurityScheme ?? undefined,
      socialSecuritySubsidy: Number(profile?.socialSecuritySubsidy ?? 0),
      rankAllowance: Number(profile?.rankAllowance ?? 0),
      mealAllowanceRate: Number(profile?.mealAllowanceRate ?? 0),
      makeupAllowance: Number(profile?.makeupAllowance ?? 0),
      employeeInsurance: Number(profile?.employeeInsurance ?? 0),
      employeeProvidentFund: Number(profile?.employeeProvidentFund ?? 0),
      employerInsurance: Number(profile?.employerInsurance ?? 0),
      employerProvidentFund: Number(profile?.employerProvidentFund ?? 0),
      effectiveFrom: today,
      reason: ''
    });
  }
}
let positionLoadSequence = 0;
async function loadPositions(id: string) {
  const sequence = ++positionLoadSequence;
  form.positionId = undefined;
  form.payrollTemplateName = undefined;
  form.payrollGrade = undefined;
  form.payrollCategory = undefined;
  form.payrollBaseSalary = undefined;
  form.payrollPerformanceBase = undefined;
  positions.value = [];
  positionLoadError.value = '';
  positionLoading.value = true;
  try {
    const nextPositions = (await getV2StorePositions(id)).filter((item) => item.enabled);
    if (sequence === positionLoadSequence) positions.value = nextPositions;
  } catch (error) {
    if (sequence === positionLoadSequence) {
      positionLoadError.value = error instanceof Error ? error.message : '岗位加载失败，请稍后重试';
      message.error(positionLoadError.value);
    }
  } finally {
    if (sequence === positionLoadSequence) positionLoading.value = false;
  }
}
async function resetPassword(employee: V2EmployeeItem) {
  const result = await resetV2EmployeePassword(employee.id);
  message.success(`密码已重置为 ${result.initialPassword}`);
}
async function save() {
  if (['employee', 'editEmployee'].includes(kind.value) && !/^1[3-9]\d{9}$/.test(form.phone?.trim() ?? '')) {
    message.warning('请填写有效的 11 位手机号码');
    return;
  }
  if (kind.value === 'employee') {
    if (!form.name?.trim() || !form.phone?.trim() || !form.hiredOn) {
      message.warning('请完整填写姓名、手机号和入职日期');
      return;
    }
    const assignmentMissing =
      form.assignmentType === 'HEAD_OFFICE'
        ? !form.organizationId || !form.organizationPositionId
        : !form.storeId || !form.positionId;
    if (assignmentMissing) {
      message.warning('请选择员工的任职组织和岗位');
      return;
    }
    if (
      selectedOrganizationPosition.value?.requiresPGrade &&
      (!form.grade || !form.costStoreId)
    )
      return message.warning('店长职能岗必须选择P等级和管理门店');
  }
  if (kind.value === 'employee' && isSuperAdmin.value && form.createLoginAccount && !form.loginRoleIds?.length) {
    message.warning('开通登录账号时请选择角色');
    return;
  }
  if (kind.value === 'editEmployee' && form.openEmployeeAccount &&
      (!form.phone?.trim() || (form.loginPassword?.length ?? 0) < 8 || !form.loginRoleIds?.length)) {
    message.warning('请填写手机号、至少 8 位初始密码并选择角色');
    return;
  }
  saving.value = true;
  try {
    if (kind.value === 'employee' || (kind.value === 'editEmployee' && selectedEmployee.value)) {
      const { loginRoleIds, openEmployeeAccount, loginPassword, loginNickname, ...details } = form;
      if (kind.value === 'employee') {
        await createV2Employee({
          ...details,
          ...(details.createLoginAccount ? { loginPassword, loginNickname } : {}),
          ...(isSuperAdmin.value && details.createLoginAccount && loginRoleIds ? { loginRoleIds } : {})
        });
      } else if (selectedEmployee.value) {
        await updateV2Employee(selectedEmployee.value.id, {
          ...details,
          ...(!gradeChanged.value ? { grade: undefined, gradeEffectiveOn: undefined } : {}),
          ...(editableAccount.value ? { loginNickname } : {}),
          ...(editableAccount.value && roleSelectionChanged.value ? { loginRoleIds } : {}),
          ...(canOpenEmployeeAccount.value && openEmployeeAccount ? { loginPassword, loginRoleIds, loginNickname } : {})
        });
      }
    }
    else if (kind.value === 'employment' && selectedEmployee.value)
      await addV2Employment(selectedEmployee.value.id, form);
    else if (kind.value === 'managerTransfer' && selectedEmployee.value)
      await changeV2ManagerStore(selectedEmployee.value.id, {
        managedStoreId: form.managedStoreId,
        effectiveOn: form.effectiveOn,
        reason: form.reason
      });
    else if (kind.value === 'transfer' && selectedEmployee.value)
      await changeV2Employment(selectedEmployee.value.id, form);
    else if (kind.value === 'terminate' && selectedEmployee.value)
      await terminateV2Employee(selectedEmployee.value.id, form);
    else if (kind.value === 'leave' && selectedEmployee.value)
      await createV2EmployeeLeave(selectedEmployee.value.id, {
        storeId: form.storeId,
        type: form.type,
        startsAt: `${form.startsOn}T00:00:00+08:00`,
        endsAt: `${form.endsOn}T23:59:59+08:00`,
        reason: form.reason
      });
    else if (kind.value === 'payroll' && selectedEmployee.value)
      await createV2EmployeePayrollProfile(selectedEmployee.value.id, form);
    modalOpen.value = false;
    await load();
    message.success(
      kind.value === 'employee' && form.createLoginAccount
        ? `入职完成；登录账号为 ${form.phone}，初始密码为 123456`
        : '已保存',
      { duration: 6000 }
    );
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存员工失败');
  } finally {
    saving.value = false;
  }
}
onMounted(() => void load());
</script>
<style scoped>
.hidden-file-input { display: none; }
.import-result-modal { width: min(680px, calc(100vw - 32px)); }
.import-failure-list { margin-top: 16px; max-height: 360px; overflow-y: auto; }
.employee-scope-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
}
.employee-scope-toolbar > div:first-child {
  display: grid;
  gap: 4px;
  margin-right: auto;
}
.employee-scope-toolbar small {
  color: var(--bc-muted);
}
.employee-scope-select {
  width: min(320px, 100%);
}
@media (max-width: 760px) {
  .employee-scope-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .employee-scope-select {
    width: 100%;
  }
}
.login-fields {
  margin-top: 14px;
}
.account-hint {
  display: block;
  margin-top: -8px;
  color: var(--bc-muted);
}
.employee-account-cell {
  display: grid;
  gap: 3px;
}
.employee-account-cell small {
  color: var(--bc-muted);
  font-size: 11px;
}
</style>
