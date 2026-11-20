<template>
  <div class="page-stack">
    <div class="section-head">
      <div>
        <h1>员工中心</h1>
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
        description="当前组织暂无在职员工" /><n-data-table
        v-else
        :loading="employeeLoading"
        :columns="columns"
        :data="employees"
        :scroll-x="760"
    /></n-card>
    <n-card v-if="isSuperAdmin" :bordered="false">
      <n-collapse>
        <n-collapse-item name="system-accounts">
          <template #header>
            <div class="account-collapse-title">
              <strong>系统账号与管理员配置</strong>
              <n-tag size="small" :bordered="false"
                >{{ access?.accounts.length ?? 0 }} 个账号</n-tag
              >
            </div>
          </template>
          <n-alert type="info" :bordered="false" class="account-link-hint">
            员工账号权限由当前岗位自动映射；系统管理员账号请在“账号与角色”中集中维护。
          </n-alert>
          <n-empty v-if="!access?.accounts.length" description="尚未开通账号" />
          <n-list v-else bordered>
            <n-list-item v-for="item in access.accounts" :key="item.id">
              <div class="account-row">
                <div>
                  <strong>{{ item.displayName }}</strong>
                  <small
                    >{{ item.username }} ·
                    {{ item.employee?.name ?? '未绑定员工' }}</small
                  >
                </div>
                <n-tag>{{ item.dataScope }}</n-tag>
              </div>
            </n-list-item>
          </n-list>
        </n-collapse-item>
      </n-collapse>
    </n-card>
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
          ><n-form-item label="手机号"
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
                  :options="managerGrades"
                  :menu-props="gradeMenuProps"
                  :consistent-menu-width="false"
                  placement="top-start"
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
                  :menu-props="storeMenuProps"
                  placement="top-start"
                  filterable
                  @update:value="loadPositions" /></n-form-item
              ><n-form-item label="岗位"
                ><n-select
                  v-model:value="form.positionId"
                  :options="positionOptions"
              /></n-form-item>
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
                  :menu-props="gradeMenuProps"
                  :consistent-menu-width="false"
                  placement="top-start"
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
                  ><n-form-item-gi label="登录账号"
                    ><n-input
                      v-model:value="form.loginUsername"
                      disabled
                      placeholder="默认使用员工手机号" /></n-form-item-gi
                  ><n-form-item-gi label="初始密码"
                    ><n-input
                      v-model:value="form.loginPassword"
                      type="password"
                      disabled
                      placeholder="123456" /></n-form-item-gi></n-grid
                ><small class="account-hint"
                  >账号权限由任职岗位自动确定，调岗或兼岗后自动更新；首次登录必须修改密码。</small
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
              :options="positionOptions" /></n-form-item
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
        <template v-else-if="kind === 'role'"
          ><n-form-item label="角色名称"
            ><n-input v-model:value="form.name" /></n-form-item
          ><n-form-item label="角色编码"
            ><n-input v-model:value="form.code" /></n-form-item
          ><n-form-item label="权限"
            ><n-checkbox-group v-model:value="form.permissionCodes"
              ><n-space
                ><n-checkbox
                  v-for="item in permissionOptions"
                  :key="item.value"
                  :value="item.value"
                  :label="
                    item.label
                  " /></n-space></n-checkbox-group></n-form-item
          ><n-form-item label="说明"
            ><n-input
              v-model:value="form.description"
              type="textarea" /></n-form-item
        ></template>
        <template v-else
          ><n-form-item label="登录名"
            ><n-input v-model:value="form.username" /></n-form-item
          ><n-form-item label="初始密码"
            ><n-input
              v-model:value="form.password"
              type="password" /></n-form-item
          ><n-form-item label="显示名称"
            ><n-input v-model:value="form.displayName" /></n-form-item
          ><n-form-item label="关联员工"
            ><n-select
              v-model:value="form.employeeId"
              :options="employeeOptions"
              clearable /></n-form-item
          ><n-form-item label="数据范围"
            ><n-select
              v-model:value="form.dataScope"
              :options="dataScopeOptions" /></n-form-item
          ><n-form-item
            v-if="form.dataScope === 'ASSIGNED_STORES'"
            label="指定门店"
            ><n-select
              v-model:value="form.storeIds"
              :options="storeOptions"
              multiple /></n-form-item
          ><n-form-item label="角色"
            ><n-select
              v-model:value="form.roleIds"
              :options="roleOptions"
              multiple /></n-form-item
        ></template> </n-form
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
  NSelect,
  NDataTable,
  NDatePicker,
  NButton,
  NPopconfirm,
  NSpace,
  NTag,
  type DataTableColumns,
  useMessage
} from 'naive-ui';
import {
  addV2Employment,
  changeV2ManagerStore,
  changeV2Employment,
  createV2Account,
  createV2Employee,
  downloadV2EmployeeImportTemplate,
  createV2EmployeeLeave,
  createV2EmployeePayrollProfile,
  createV2Role,
  getV2AccessControl,
  getV2Employees,
  getV2EmployeePayrollProfiles,
  getV2MasterDataOverview,
  getV2OnboardingPayrollTemplates,
  getV2PayrollProfileTemplates,
  getV2StoreArchive,
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
const storeMenuProps = {
  class: 'employee-store-select-menu',
  style: { '--n-height': 'min(360px, calc(100svh - 140px))' }
};
const gradeMenuProps = {
  class: 'employee-grade-select-menu',
  style: { minWidth: '220px', maxHeight: '240px', zIndex: '10000' }
};
const title = computed(
    () =>
      ({
        employee: '新增员工',
        editEmployee: `编辑员工 · ${selectedEmployee.value?.name ?? ''}`,
        role: '新增角色',
        account: '开通登录账号',
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
  scopeOptions = computed(() =>
    scopeType.value === 'STORE' ? storeOptions.value : headOfficeOptions.value
  ),
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
  employeeOptions = computed(() =>
    employees.value.map((i) => ({
      label: `${i.name} · ${i.employeeNo}`,
      value: i.id
    }))
  ),
  roleOptions = computed(
    () => access.value?.roles.map((i) => ({ label: i.name, value: i.id })) ?? []
  ),
  dataScopeOptions = [
    { label: '员工任职门店', value: 'EMPLOYEE_STORE' },
    { label: '指定门店', value: 'ASSIGNED_STORES' },
    { label: '全部门店', value: 'ALL_STORES' }
  ],
  leaveTypeOptions = [
    { label: '年假', value: 'ANNUAL' },
    { label: '病假', value: 'SICK' },
    { label: '事假', value: 'PERSONAL' },
    { label: '调休', value: 'COMPENSATORY' },
    { label: '其他', value: 'OTHER' }
  ],
  permissionOptions = [
    { label: '门店查看', value: 'store:view' },
    { label: '门店维护', value: 'store:update' },
    { label: '员工查看', value: 'employee:view' },
    { label: '员工维护', value: 'employee:update' },
    { label: '员工新增', value: 'employee:create' },
    { label: '排班维护', value: 'schedule:update' },
    { label: '业绩查看', value: 'performance:view' },
    { label: '业绩维护/采集', value: 'performance:update' },
    { label: '评分查看', value: 'scoring:view' },
    { label: '评分维护', value: 'scoring:update' },
    { label: '权限查看', value: 'permission:view' },
    { label: '权限维护', value: 'permission:update' },
    { label: '薪资档案查看', value: 'employee.payroll:view' },
    { label: '薪资档案维护', value: 'employee.payroll:update' }
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
                .filter((item) => item.store.id === selectedScopeId.value)
                .map((item) => item.position.id),
              ...employee.organizationEmployments
                .filter((item) => item.costStore?.id === selectedScopeId.value)
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
      if (!account) return '未开通';
      return h('div', { class: 'employee-account-cell' }, [
        h('span', `${account.username} · ${account.status}`),
        h(
          'small',
          account.roles.map((item) => item.role.name).join('、') || '未分配角色'
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
async function loadScopedEmployees() {
  if (!selectedScopeId.value) {
    employees.value = [];
    return;
  }
  employeeLoading.value = true;
  try {
    employees.value = await getV2Employees(
      scopeType.value === 'STORE'
        ? { storeId: selectedScopeId.value }
        : { organizationId: selectedScopeId.value }
    );
  } finally {
    employeeLoading.value = false;
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
  const nextPositions = (await getV2StoreArchive(id)).positions;
  if (sequence === positionLoadSequence) positions.value = nextPositions;
}
async function resetPassword(employee: V2EmployeeItem) {
  const result = await resetV2EmployeePassword(employee.id);
  message.success(`密码已重置为 ${result.initialPassword}`);
}
async function save() {
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
  saving.value = true;
  try {
    if (kind.value === 'employee') await createV2Employee(form);
    else if (kind.value === 'editEmployee' && selectedEmployee.value)
      await updateV2Employee(selectedEmployee.value.id, form);
    else if (kind.value === 'role') await createV2Role(form);
    else if (kind.value === 'account') await createV2Account(form);
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
  } finally {
    saving.value = false;
  }
}
onMounted(() => void load());
</script>
<style scoped>
:global(.employee-grade-select-menu) {
  min-width: 220px !important;
  max-height: min(240px, calc(100svh - 160px)) !important;
  z-index: 10000 !important;
}
:global(.employee-grade-select-menu .n-base-select-menu__content) {
  max-height: min(220px, calc(100svh - 180px)) !important;
  overflow-y: auto !important;
}
.hidden-file-input { display: none; }
.import-result-modal { width: min(680px, calc(100vw - 32px)); }
.import-failure-list { margin-top: 16px; max-height: 360px; overflow-y: auto; }
.account-collapse-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.account-link-hint {
  margin-bottom: 12px;
}
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
.account-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.account-row small {
  display: block;
  margin-top: 3px;
  color: var(--bc-muted);
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
