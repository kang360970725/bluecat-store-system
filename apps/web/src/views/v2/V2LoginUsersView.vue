<template>
  <div class="page-stack">
    <div class="section-head">
      <div>
        <h1>账号与角色</h1>
        <p>账号、角色、数据范围和权限集中维护；员工档案与登录账号相互独立。</p>
      </div>
      <n-space>
        <n-button secondary @click="openGrantAudit">授权记录</n-button>
        <n-button secondary @click="openCreateRole">新增角色</n-button>
        <n-button type="primary" @click="accountModalOpen = true"
          >开通账号</n-button
        >
        <n-button secondary :loading="loading" @click="loadAll">刷新</n-button>
      </n-space>
    </div>

    <div class="metric-strip">
      <div>
        <span>可登录用户</span><strong>{{ users.length }}</strong>
      </div>
      <div>
        <span>启用账号</span><strong>{{ activeCount }}</strong>
      </div>
      <div>
        <span>今日已登录</span><strong>{{ todayCount }}</strong>
      </div>
      <div>
        <span>从未记录</span><strong>{{ neverCount }}</strong>
      </div>
    </div>

    <n-card :bordered="false">
      <div class="table-tools">
        <n-input
          v-model:value="keyword"
          clearable
          placeholder="搜索姓名、账号或员工编号"
        />
        <n-select
          v-model:value="statusFilter"
          :options="statusOptions"
          class="status-filter"
        />
      </div>
      <n-data-table
        :columns="columns"
        :data="filteredUsers"
        :loading="loading"
        :scroll-x="980"
        :row-key="(row: V2LoginUser) => `${row.accountType}:${row.id}`"
      />
    </n-card>

    <n-card title="角色与权限" :bordered="false">
      <div class="role-grid">
        <div
          v-for="role in access?.roles || []"
          :key="role.id"
          class="role-card"
        >
          <div>
            <strong>{{ role.name }}</strong
            ><n-tag size="small" :bordered="false">{{ role.code }}</n-tag>
          </div>
          <p>{{ role.description || '暂无角色说明' }}</p>
          <div class="role-card-footer">
            <span>{{ role.permissions.length }} 项权限</span>
            <n-button
              size="small"
              secondary
              :disabled="role.code === 'super_admin'"
              @click="openEditRole(role)"
              >{{
                role.code === 'super_admin' ? '系统保护' : '编辑权限'
              }}</n-button
            >
            <n-button
              size="small"
              text
              @click="openRoleAudit(role.id, role.name)"
              >变更记录</n-button
            >
          </div>
        </div>
        <n-empty v-if="!access?.roles.length" description="暂无角色" />
      </div>
    </n-card>

    <n-modal
      v-model:show="accountRolesOpen"
      preset="card"
      class="bc-modal-md"
      :title="`账号角色 · ${editingAccountRoles?.displayName ?? ''}`"
      :mask-closable="!accountRolesSaving"
      content-style="overflow-y: auto;"
    >
      <n-space vertical>
        <n-alert v-if="editingAccountRoles?.usesAccountRoles === false" type="warning">
          保存后，此账号改用所选角色。角色适用于账号授权的门店，请核对跨店兼岗权限。
        </n-alert>
        <n-select
          v-model:value="selectedAccountRoleIds"
          multiple
          filterable
          placeholder="选择账号角色"
          :options="assignableAccountRoles"
          :disabled="accountRolesSaving"
        />
      </n-space>
      <template #footer>
        <n-space justify="end">
          <n-button :disabled="accountRolesSaving" @click="accountRolesOpen = false">取消</n-button>
          <n-button type="primary" :loading="accountRolesSaving" @click="saveAccountRoles">保存角色</n-button>
        </n-space>
      </template>
    </n-modal>

    <n-modal
      v-model:show="scopeOpen"
      preset="card"
      :title="`门店范围 · ${scopeAccount?.displayName ?? ''}`"
      class="bc-modal-lg scope-modal"
      :class="{ 'scope-modal-expanded': scopeMode === 'ASSIGNED_STORES' }"
      :mask-closable="!scopeSaving"
      content-style="min-height: 0; overflow-y: auto;"
    >
      <n-space vertical>
        <n-select
          v-model:value="scopeMode"
          :options="scopeModes"
          :disabled="scopeSaving"
        />
        <p>门店范围决定账号可访问哪些门店，角色决定可执行哪些操作。</p>
        <template v-if="scopeMode === 'ASSIGNED_STORES'">
          <div class="scope-selection-heading">
            <strong>已选择 {{ scopeIds.length }} 家门店</strong>
            <span>留空表示不授权门店</span>
          </div>
          <n-input
            v-model:value="scopeSearch"
            clearable
            placeholder="搜索门店"
            :disabled="scopeSaving"
          />
          <div class="scope-store-list">
            <n-checkbox-group v-model:value="scopeIds" :disabled="scopeSaving">
              <div v-if="visibleScopeStores.length" class="scope-store-grid">
                <n-checkbox
                  v-for="store in visibleScopeStores"
                  :key="store.value"
                  :value="store.value"
                  :label="store.label"
                />
              </div>
              <n-empty v-else description="没有匹配的门店" />
            </n-checkbox-group>
          </div>
        </template>
      </n-space>
      <template #footer>
        <n-space justify="end">
          <n-button :disabled="scopeSaving" @click="scopeOpen = false">取消</n-button>
          <n-button type="primary" :loading="scopeSaving" @click="saveScope">
            保存门店范围
          </n-button>
        </n-space>
      </template>
    </n-modal>
    <n-modal
      v-model:show="grantAuditOpen"
      preset="card"
      title="授权记录"
      class="bc-modal-lg"
      content-style="max-height: calc(100svh - 190px); overflow-y: auto;"
    >
      <n-spin :show="grantAuditLoading">
        <p>显示最近 50 条账号角色、门店范围及历史岗位授权记录。</p>
        <p v-if="!grantAuditRows.length && !grantAuditLoading">暂无授权记录</p>
        <n-card
          v-for="row in grantAuditRows"
          :key="row.id"
          size="small"
          class="mt-2"
        >
          <p>
            {{ formatDateTime(row.createdAt) }} · {{ row.actorName }} ·
            {{ row.subjectName }}
          </p>
          <p>原授权：{{ describeGrant(row.before) }}</p>
          <p>新授权：{{ describeGrant(row.after) }}</p>
        </n-card>
      </n-spin>
    </n-modal>

    <n-modal
      v-model:show="permissionModalOpen"
      preset="card"
      :title="permissionTitle"
      class="bc-modal-lg"
      content-style="max-height: calc(100svh - 190px); overflow-y: auto;"
    >
      <n-spin :show="permissionLoading">
        <template v-if="permissionPreview">
          <p>
            按当前数据库授权预览员工考勤和运营任务。导出还需同时具备相应查看权限。
          </p>
          <p v-if="permissionPreview.mustChangePassword">
            账号需先修改初始密码。
          </p>
          <n-table size="small">
            <thead>
              <tr>
                <th>权限</th>
                <th>有效门店范围</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in permissionPreview.rows" :key="row.code">
                <td>{{ row.name }}</td>
                <td>
                  {{
                    row.allStores
                      ? '全部门店'
                      : row.stores.map((store) => store.name).join('、') ||
                        '未授权'
                  }}
                </td>
              </tr>
            </tbody>
          </n-table>
        </template>
        <template v-else-if="permissionAudit">
          <p>显示通过角色管理保存的最近 30 条权限变更。</p>
          <p v-if="!permissionAudit.length">暂无变更记录</p>
          <n-card
            v-for="entry in permissionAudit"
            :key="entry.id"
            size="small"
            class="mt-2"
          >
            <p>{{ formatDateTime(entry.createdAt) }} · {{ entry.actorName }}</p>
            <p>
              新增：{{
                permissionDiff(entry.afterCodes, entry.beforeCodes) || '无'
              }}
            </p>
            <p>
              移除：{{
                permissionDiff(entry.beforeCodes, entry.afterCodes) || '无'
              }}
            </p>
          </n-card>
        </template>
      </n-spin>
    </n-modal>

    <n-modal
      v-model:show="roleModalOpen"
      preset="card"
      :title="editingRole ? `编辑角色 · ${editingRole.name}` : '新增角色'"
      class="bc-modal-lg"
      content-style="max-height: calc(100svh - 190px); overflow-y: auto;"
    >
      <n-form label-placement="top">
        <n-form-item label="角色名称"
          ><n-input v-model:value="roleForm.name" placeholder="例如：门店财务"
        /></n-form-item>
        <n-alert type="info" :bordered="false">{{
          editingRole
            ? `角色编码：${editingRole.code}。编码由系统管理，不允许修改。`
            : '角色编码保存时由系统自动生成。'
        }}</n-alert>
        <n-form-item label="角色说明"
          ><n-input v-model:value="roleForm.description" type="textarea"
        /></n-form-item>
        <n-form-item label="功能权限">
          <n-tree
            block-line
            checkable
            cascade
            default-expand-all
            :data="permissionTreeData"
            :checked-keys="roleForm.permissionCodes"
            @update:checked-keys="updatePermissionKeys"
          />
        </n-form-item>
      </n-form>
      <template #footer
        ><n-space justify="end"
          ><n-button @click="roleModalOpen = false">取消</n-button
          ><n-button type="primary" :loading="saving" @click="saveRole">{{
            editingRole ? '保存修改' : '创建角色'
          }}</n-button></n-space
        ></template
      >
    </n-modal>

    <n-modal
      v-model:show="accountModalOpen"
      preset="card"
      title="开通登录账号"
      class="bc-modal-md"
      content-style="max-height: calc(100svh - 190px); overflow-y: auto;"
    >
      <n-form label-placement="top">
        <n-form-item label="关联员工"
          ><n-select
            v-model:value="accountForm.employeeId"
            filterable
            clearable
            :options="employeeOptions"
            placeholder="可选，建议关联员工档案"
        /></n-form-item>
        <n-form-item label="显示名称"
          ><n-input v-model:value="accountForm.displayName"
        /></n-form-item>
        <n-form-item label="登录账号"
          ><n-input v-model:value="accountForm.username"
        /></n-form-item>
        <n-form-item label="初始密码"
          ><n-input
            v-model:value="accountForm.password"
            type="password"
            show-password-on="click"
            placeholder="至少 8 位"
        /></n-form-item>
        <n-form-item label="角色"
          ><n-select
            v-model:value="accountForm.roleIds"
            multiple
            :options="roleOptions"
        /></n-form-item>
        <n-form-item label="数据范围"
          ><n-select
            v-model:value="accountForm.dataScope"
            :options="scopeOptions"
        /></n-form-item>
        <n-form-item
          v-if="accountForm.dataScope === 'ASSIGNED_STORES'"
          label="指定门店"
          ><n-select
            v-model:value="accountForm.storeIds"
            multiple
            filterable
            :options="storeOptions"
        /></n-form-item>
      </n-form>
      <template #footer
        ><n-space justify="end"
          ><n-button @click="accountModalOpen = false">取消</n-button
          ><n-button type="primary" :loading="saving" @click="saveAccount"
            >开通账号</n-button
          ></n-space
        ></template
      >
    </n-modal>

    <n-modal
      v-model:show="logModalOpen"
      preset="card"
      :title="`${selectedUser?.displayName ?? ''} · 登录日志`"
      class="log-modal"
      style="width: min(620px, calc(100vw - 32px)); max-width: 620px"
      content-style="min-height: 320px; max-height: min(640px, calc(100svh - 170px)); overflow-y: auto;"
    >
      <n-spin :show="logsLoading" class="log-content">
        <n-empty
          v-if="!logsLoading && !logs.length"
          class="log-empty"
          description="暂无登录记录"
        />
        <n-timeline v-else>
          <n-timeline-item v-for="log in logs" :key="log.id" type="success">
            <template #header>
              <div class="log-title">{{ formatDateTime(log.loggedInAt) }}</div>
            </template>
            <div class="log-meta">
              <span>{{ relativeLogin(log.loggedInAt) }}</span>
              <span>IP：{{ log.ipAddress || '未获取' }}</span>
              <span>{{ deviceName(log.userAgent) }}</span>
            </div>
          </n-timeline-item>
        </n-timeline>
      </n-spin>
      <div v-if="logTotal > logPageSize" class="pagination-wrap">
        <n-pagination
          v-model:page="logPage"
          :page-size="logPageSize"
          :item-count="logTotal"
          @update:page="loadLogs"
        />
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { DataTableColumns } from 'naive-ui';
import {
  NSelect,
  NDataTable,
  NTree,
  NButton,
  NSpace,
  NTag,
  useMessage,
  NTimeline,
  NTimelineItem
} from 'naive-ui';
import {
  createV2Account,
  createV2Role,
  getV2AccessControl,
  getV2AuthorizationAudit,
  updateV2AccountScope,
  updateV2AccountRoles,
  type V2AccountScopeMode,
  type V2AuthorizationAudit,
  type V2AuthorizationSnapshot,
  getV2EffectivePermissions,
  getV2RolePermissionAudit,
  type V2EffectivePermissions,
  type V2RolePermissionAudit,
  getV2Employees,
  getV2LoginLogs,
  getV2LoginUsers,
  getV2MasterDataOverview,
  updateV2Role,
  type V2AccessControl,
  type V2EmployeeItem,
  type V2LoginLog,
  type V2LoginUser,
  type V2MasterDataOverview
} from '@/api/v2-master-data';

const message = useMessage();
const permissionModalOpen = ref(false);
const permissionLoading = ref(false);
const permissionTitle = ref('');
const permissionPreview = ref<V2EffectivePermissions>();
const permissionAudit = ref<V2RolePermissionAudit[]>();
let permissionRequest = 0;

function permissionDiff(after: string[], before: string[]) {
  return after
    .filter((code) => !before.includes(code))
    .map((code) => permissionLabel(code, code))
    .join('、');
}

async function openPermissionDialog(title: string, load: () => Promise<void>) {
  permissionTitle.value = title;
  permissionPreview.value = undefined;
  permissionAudit.value = undefined;
  permissionModalOpen.value = true;
  permissionLoading.value = true;
  const sequence = ++permissionRequest;
  try {
    await load();
  } catch (error) {
    if (sequence === permissionRequest) message.error((error as Error).message);
  } finally {
    if (sequence === permissionRequest) permissionLoading.value = false;
  }
}

function openPreview(row: V2LoginUser) {
  const sequence = permissionRequest + 1;
  void openPermissionDialog(`有效权限 · ${row.displayName}`, async () => {
    const data = await getV2EffectivePermissions(row.id);
    if (sequence === permissionRequest) permissionPreview.value = data;
  });
}

function openRoleAudit(id: string, name: string) {
  const sequence = permissionRequest + 1;
  void openPermissionDialog(`权限变更 · ${name}`, async () => {
    const data = await getV2RolePermissionAudit(id);
    if (sequence === permissionRequest) permissionAudit.value = data;
  });
}

const users = ref<V2LoginUser[]>([]);
const loading = ref(false);
const saving = ref(false);
const access = ref<V2AccessControl | null>(null);
const employees = ref<V2EmployeeItem[]>([]);
const overview = ref<V2MasterDataOverview | null>(null);
const roleModalOpen = ref(false);
const editingRole = ref<V2AccessControl['roles'][number] | null>(null);
const accountModalOpen = ref(false);
const roleForm = ref({
  name: '',
  description: '',
  permissionCodes: [] as string[]
});
const accountForm = ref({
  employeeId: null as string | null,
  displayName: '',
  username: '',
  password: '',
  roleIds: [] as string[],
  dataScope: 'EMPLOYEE_STORE',
  storeIds: [] as string[]
});
const route = useRoute();
const keyword = ref(typeof route.query.account === 'string' ? route.query.account : '');
const statusFilter = ref('ALL');
const logModalOpen = ref(false);
const logsLoading = ref(false);
const selectedUser = ref<V2LoginUser | null>(null);
const logs = ref<V2LoginLog[]>([]);
const logTotal = ref(0);
const logPage = ref(1);
const logPageSize = 20;
const statusOptions = [
  { label: '全部状态', value: 'ALL' },
  { label: '已启用', value: 'ACTIVE' },
  { label: '已停用', value: 'DISABLED' }
];
const scopeOptions = [
  { label: '员工任职门店', value: 'EMPLOYEE_STORE' },
  { label: '指定门店', value: 'ASSIGNED_STORES' },
  { label: '全部门店', value: 'ALL_STORES' }
];
const roleOptions = computed(() =>
  (access.value?.roles || []).filter((item) => item.enabled).map((item) => ({
    label: item.name,
    value: item.id
  }))
);
const employeeOptions = computed(() =>
  employees.value.map((item) => ({
    label: `${item.name} · ${item.employeeNo}`,
    value: item.id
  }))
);
const storeOptions = computed(() =>
  (overview.value?.stores || []).map((item) => ({
    label: item.shortName || item.name,
    value: item.id
  }))
);
const scopeModes = [
  { label: '随员工任职门店', value: 'EMPLOYEE_STORE' },
  { label: '指定门店', value: 'ASSIGNED_STORES' },
  { label: '全部门店', value: 'ALL_STORES' }
];
const accountRolesOpen = ref(false);
const accountRolesSaving = ref(false);
const editingAccountRoles = ref<V2LoginUser>();
const selectedAccountRoleIds = ref<string[]>([]);
const assignableAccountRoles = computed(() =>
  (access.value?.roles ?? [])
    .filter((role) => role.enabled && role.code !== 'super_admin')
    .map((role) => ({ label: role.name, value: role.id }))
);

function openAccountRoles(row: V2LoginUser) {
  if (row.accountType !== 'V2_ACCOUNT' || row.roles.some((role) => role.code === 'super_admin')) return;
  editingAccountRoles.value = row;
  const account = access.value?.accounts.find((item) => item.id === row.id);
  selectedAccountRoleIds.value = row.usesAccountRoles === false
    ? []
    : (account?.roles ?? [])
        .map(({ role }) => role.id)
        .filter((id) => assignableAccountRoles.value.some((option) => option.value === id));
  accountRolesOpen.value = true;
}

async function saveAccountRoles() {
  if (!editingAccountRoles.value || accountRolesSaving.value) return;
  accountRolesSaving.value = true;
  try {
    await updateV2AccountRoles(editingAccountRoles.value.id, selectedAccountRoleIds.value);
    accountRolesOpen.value = false;
    await loadAll();
    message.success('账号角色已保存');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存账号角色失败');
  } finally {
    accountRolesSaving.value = false;
  }
}

const scopeOpen = ref(false);
const scopeSaving = ref(false);
const scopeAccount = ref<V2LoginUser>();
const scopeMode = ref<V2AccountScopeMode>('EMPLOYEE_STORE');
const scopeIds = ref<string[]>([]);
const scopeSearch = ref('');
const editableStoreOptions = computed(() => {
  const options = new Map(storeOptions.value.map((item) => [item.value, item]));
  for (const store of scopeAccount.value?.stores ?? []) {
    if (!options.has(store.id))
      options.set(store.id, { value: store.id, label: store.name });
  }
  return [...options.values()];
});
const visibleScopeStores = computed(() => {
  const search = scopeSearch.value.trim().toLowerCase();
  return editableStoreOptions.value.filter((store) =>
    store.label.toLowerCase().includes(search)
  );
});
const grantAuditOpen = ref(false);
const grantAuditLoading = ref(false);
const grantAuditRows = ref<V2AuthorizationAudit[]>([]);

function openScope(row: V2LoginUser) {
  scopeAccount.value = row;
  scopeSearch.value = '';
  scopeMode.value =
    row.dataScope === 'ALL_STORES' || row.dataScope === 'ASSIGNED_STORES'
      ? row.dataScope
      : 'EMPLOYEE_STORE';
  scopeIds.value =
    scopeMode.value === 'ASSIGNED_STORES'
      ? row.stores.map((store) => store.id)
      : [];
  scopeOpen.value = true;
}

async function saveScope() {
  if (!scopeAccount.value || scopeSaving.value) return;
  scopeSaving.value = true;
  try {
    await updateV2AccountScope(
      scopeAccount.value.id,
      scopeMode.value,
      scopeMode.value === 'ASSIGNED_STORES' ? scopeIds.value : []
    );
    scopeOpen.value = false;
    message.success('门店范围已保存');
    await loadUsers();
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    scopeSaving.value = false;
  }
}

async function openGrantAudit() {
  if (grantAuditLoading.value) return;
  grantAuditOpen.value = true;
  grantAuditLoading.value = true;
  try {
    grantAuditRows.value = await getV2AuthorizationAudit();
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    grantAuditLoading.value = false;
  }
}

function describeGrant(snapshot: V2AuthorizationSnapshot | null) {
  if (!snapshot) return '首次授权';
  if (snapshot.roleIds) {
    if (snapshot.usesAccountRoles === false) return '随岗位授权';
    return snapshot.roleIds.map((id) =>
      access.value?.roles.find((role) => role.id === id)?.name ?? id
    ).join('、') || '无绑定角色';
  }
  if ('roleId' in snapshot)
    return (
      access.value?.roles.find((role) => role.id === snapshot.roleId)?.name ??
      snapshot.roleId ??
      '无绑定角色'
    );
  const mode =
    scopeModes.find((item) => item.value === snapshot.dataScope)?.label ??
    '未知范围';
  const stores =
    snapshot.storeIds?.map(
      (id) =>
        storeOptions.value.find((store) => store.value === id)?.label ?? id
    ) ?? [];
  return stores.length ? `${mode} · ${stores.join('、')}` : mode;
}

const permissionDictionary: Record<string, string> = {
  'store:view': '查看门店',
  'store:update': '维护门店资料',
  'store:create': '新增门店',
  'store:delete': '删除门店',
  'employee:view': '查看员工档案',
  'employee:create': '办理员工入职',
  'employee:update': '维护员工与办理异动',
  'employee:delete': '删除员工',
  'employee.payroll:view': '查看员工薪资档案',
  'employee.payroll:update': '维护员工薪资档案',
  'employee.grade:view': '查看职级与薪资标准',
  'employee.grade:update': '维护职级与薪资标准',
  'finance.payroll:view_summary': '查看工资汇总',
  'finance.payroll:view_all_stores': '查看全部门店工资',
  'finance.payroll:view_sensitive': '查看工资敏感明细',
  'finance.payroll:edit_inputs': '维护工资核算输入',
  'finance.payroll:calculate': '执行工资试算',
  'finance.payroll:review': '复核工资',
  'finance.payroll:approve': '审批工资',
  'finance.payroll:lock': '锁定工资',
  'finance.payroll:pay': '确认发薪',
  'finance.payroll:export': '导出工资表',
  'finance.payroll:manage': '管理工资批次',
  'permission:view': '查看账号与角色',
  'permission:update': '维护账号与角色',
  'attendance:view': '查看考勤',
  'attendance:review': '审批补卡',
  'attendance:export': '导出月度考勤',
  'operational-task:manage': '派发和复核运营任务',
  'operational-task:report': '查看运营任务统计',
  'operational-task:export': '导出运营任务明细',
  'schedule:view': '查看排班',
  'schedule:update': '维护排班',
  'performance:view': '查看经营业绩',
  'performance:update': '维护经营业绩',
  'scoring:view': '查看评分',
  'scoring:update': '维护评分',
  'scoring:config': '配置评分规则'
};
const permissionTreeData = computed(() => {
  const modules = new Map<string, Array<{ label: string; value: string }>>();
  for (const item of access.value?.permissions || []) {
    const rows = modules.get(item.module) || [];
    rows.push({
      label: permissionLabel(item.code, item.name),
      value: item.code
    });
    modules.set(item.module, rows);
  }
  return [...modules.entries()].map(([module, items]) => ({
    key: `module:${module}`,
    label: moduleLabel(module),
    children: items.map((item) => ({ key: item.value, label: item.label }))
  }));
});

const activeCount = computed(
  () => users.value.filter((item) => item.status === 'ACTIVE').length
);
const todayCount = computed(
  () =>
    users.value.filter((item) => item.lastLoginAt && isToday(item.lastLoginAt))
      .length
);
const neverCount = computed(
  () => users.value.filter((item) => !item.lastLoginAt).length
);
const filteredUsers = computed(() => {
  const search = keyword.value.trim().toLowerCase();
  return users.value.filter((item) => {
    const normalizedStatus = item.status === 'ACTIVE' ? 'ACTIVE' : 'DISABLED';
    if (statusFilter.value !== 'ALL' && normalizedStatus !== statusFilter.value)
      return false;
    if (!search) return true;
    return [
      item.displayName,
      item.username,
      item.employee?.name,
      item.employee?.employeeNo
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
  });
});

const columns: DataTableColumns<V2LoginUser> = [
  {
    title: '用户',
    key: 'displayName',
    width: 190,
    render: (row) =>
      h('div', { class: 'user-cell' }, [
        h('strong', row.displayName),
        h('small', row.username)
      ])
  },
  {
    title: '状态',
    key: 'status',
    width: 90,
    render: (row) =>
      h(
        NTag,
        {
          type: row.status === 'ACTIVE' ? 'success' : 'default',
          size: 'small'
        },
        { default: () => (row.status === 'ACTIVE' ? '启用' : '停用') }
      )
  },
  {
    title: '关联员工',
    key: 'employee',
    width: 150,
    render: (row) =>
      row.employee
        ? `${row.employee.name} · ${row.employee.employeeNo}`
        : '未绑定员工'
  },
  {
    title: '角色 / 范围',
    key: 'scope',
    minWidth: 230,
    render: (row) =>
      h('div', { class: 'scope-cell' }, [
        h(
          NSpace,
          { size: 4 },
          {
            default: () =>
              row.roles.map((role) =>
                h(
                  NTag,
                  { size: 'small', bordered: false },
                  { default: () => role.name }
                )
              )
          }
        ),
        h('small', scopeText(row))
      ])
  },
  {
    title: '上次登录',
    key: 'lastLoginAt',
    width: 190,
    render: (row) =>
      h(
        'div',
        { class: 'login-time' },
        row.lastLoginAt
          ? [
              h('strong', relativeLogin(row.lastLoginAt)),
              h('small', formatDateTime(row.lastLoginAt))
            ]
          : [h('span', { class: 'muted' }, '暂无登录记录')]
      )
  },
  {
    title: '操作',
    key: 'actions',
    width: 320,
    fixed: 'right',
    render: (row) =>
      h(
        NSpace,
        {},
        {
          default: () => [
            h(
              NButton,
              { text: true, type: 'primary', onClick: () => openLogs(row) },
              { default: () => '查看日志' }
            ),
            row.accountType === 'V2_ACCOUNT' && !row.roles.some((role) => role.code === 'super_admin')
              ? h(NButton, { text: true, type: 'primary', onClick: () => openAccountRoles(row) }, { default: () => '修改角色' })
              : null,
            row.accountType === 'V2_ACCOUNT'
              ? h(
                  NButton,
                  {
                    text: true,
                    type: 'primary',
                    onClick: () => openPreview(row)
                  },
                  { default: () => '有效权限' }
                )
              : null,
            row.accountType === 'V2_ACCOUNT'
              ? h(
                  NButton,
                  {
                    text: true,
                    type: 'primary',
                    onClick: () => openScope(row)
                  },
                  { default: () => '门店范围' }
                )
              : null
          ]
        }
      )
  }
];

async function loadUsers() {
  loading.value = true;
  try {
    users.value = await getV2LoginUsers();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '加载登录用户失败');
  } finally {
    loading.value = false;
  }
}

async function loadAll() {
  loading.value = true;
  try {
    const [loginUsers, accessResult, employeeResult, overviewResult] =
      await Promise.all([
        getV2LoginUsers(),
        getV2AccessControl(),
        getV2Employees(),
        getV2MasterDataOverview()
      ]);
    users.value = loginUsers;
    access.value = accessResult;
    employees.value = employeeResult;
    overview.value = overviewResult;
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : '加载账号与角色失败'
    );
  } finally {
    loading.value = false;
  }
}

async function saveRole() {
  if (!roleForm.value.name.trim()) return message.warning('请填写角色名称');
  saving.value = true;
  try {
    if (editingRole.value)
      await updateV2Role(editingRole.value.id, roleForm.value);
    else await createV2Role(roleForm.value);
    roleModalOpen.value = false;
    const wasEditing = Boolean(editingRole.value);
    editingRole.value = null;
    roleForm.value = {
      name: '',
      description: '',
      permissionCodes: []
    };
    await loadAll();
    message.success(
      wasEditing
        ? '角色权限已更新，相关用户重新登录后生效'
        : '角色已创建，编码已自动生成'
    );
  } catch (error) {
    message.error(error instanceof Error ? error.message : '创建角色失败');
  } finally {
    saving.value = false;
  }
}

function openCreateRole() {
  editingRole.value = null;
  roleForm.value = { name: '', description: '', permissionCodes: [] };
  roleModalOpen.value = true;
}

function openEditRole(role: V2AccessControl['roles'][number]) {
  if (role.code === 'super_admin') return;
  editingRole.value = role;
  roleForm.value = {
    name: role.name,
    description: role.description ?? '',
    permissionCodes: role.permissions.map((item) => item.permission.code)
  };
  roleModalOpen.value = true;
}

async function saveAccount() {
  if (
    !accountForm.value.displayName.trim() ||
    !accountForm.value.username.trim() ||
    accountForm.value.password.length < 8
  )
    return message.warning('请完整填写名称、账号和至少 8 位密码');
  if (!accountForm.value.roleIds.length)
    return message.warning('请至少选择一个角色');
  saving.value = true;
  try {
    await createV2Account(accountForm.value);
    accountModalOpen.value = false;
    accountForm.value = {
      employeeId: null,
      displayName: '',
      username: '',
      password: '',
      roleIds: [],
      dataScope: 'EMPLOYEE_STORE',
      storeIds: []
    };
    await loadAll();
    message.success('登录账号已开通');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '开通账号失败');
  } finally {
    saving.value = false;
  }
}

async function openLogs(user: V2LoginUser) {
  selectedUser.value = user;
  logPage.value = 1;
  logModalOpen.value = true;
  await loadLogs();
}

async function loadLogs() {
  if (!selectedUser.value) return;
  logsLoading.value = true;
  try {
    const result = await getV2LoginLogs(
      selectedUser.value.accountType,
      selectedUser.value.id,
      logPage.value,
      logPageSize
    );
    logs.value = result.items;
    logTotal.value = result.total;
  } catch (error) {
    message.error(error instanceof Error ? error.message : '加载登录日志失败');
  } finally {
    logsLoading.value = false;
  }
}

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}
function relativeLogin(value: string) {
  if (isToday(value)) return '今天';
  const date = new Date(value);
  const now = new Date();
  const dateDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();
  const nowDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const days = Math.max(1, Math.round((nowDay - dateDay) / 86400000));
  return `${days}天前`;
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date(value));
}
function scopeText(row: V2LoginUser) {
  if (row.dataScope === 'ALL_STORES') return '全部门店';
  if (!row.stores.length)
    return row.dataScope === 'EMPLOYEE_STORE'
      ? '员工任职门店'
      : '未配置门店范围';
  return row.stores.map((store) => store.shortName || store.name).join('、');
}
function deviceName(userAgent?: string | null) {
  if (!userAgent) return '设备信息未获取';
  const platform = /iPhone/i.test(userAgent)
    ? 'iPhone'
    : /iPad/i.test(userAgent)
      ? 'iPad'
      : /Android/i.test(userAgent)
        ? 'Android'
        : /Windows/i.test(userAgent)
          ? 'Windows'
          : /Macintosh/i.test(userAgent)
            ? 'Mac'
            : /Linux/i.test(userAgent)
              ? 'Linux'
              : '其他设备';
  const browser = /Edg\//i.test(userAgent)
    ? 'Edge'
    : /Chrome\//i.test(userAgent)
      ? 'Chrome'
      : /Firefox\//i.test(userAgent)
        ? 'Firefox'
        : /Safari\//i.test(userAgent)
          ? 'Safari'
          : '浏览器';
  return `${platform} · ${browser}`;
}
function moduleLabel(module: string) {
  return (
    (
      {
        employee: '员工管理',
        finance: '财务薪资',
        store: '门店管理',
        permission: '账号权限',
        org: '组织管理',
        operations: '门店运营',
        attendance: '员工考勤',
        'operational-task': '运营任务',
        position: '岗位管理',
        role: '角色管理',
        user: '账号管理',
        schedule: '排班管理',
        performance: '经营业绩',
        scoring: '评分管理',
        iam: '身份权限',
        dashboard: '工作台'
      } as Record<string, string>
    )[module] || module
  );
}
function updatePermissionKeys(keys: Array<string | number>) {
  roleForm.value.permissionCodes = keys
    .map(String)
    .filter((key) => !key.startsWith('module:'));
}
function permissionLabel(code: string, name: string) {
  if (permissionDictionary[code]) return permissionDictionary[code];
  const action = code.split(':').pop() || '';
  const actionLabel = (
    {
      view: '查看',
      create: '新增',
      update: '维护',
      delete: '删除',
      config: '配置',
      audit: '审核',
      approve: '审批',
      export: '导出'
    } as Record<string, string>
  )[action];
  if (actionLabel)
    return `${actionLabel}${moduleLabel(code.split(':')[0] || '')}`;
  return name !== code ? name : code;
}

onMounted(async () => {
  await loadAll();
  if (route.query.editRoles === '1') {
    const account = users.value.find(
      (item) => item.accountType === 'V2_ACCOUNT' && item.username === route.query.account
    );
    if (account) openAccountRoles(account);
  }
});
</script>

<style scoped>
.scope-modal-expanded {
  height: min(680px, calc(100svh - 32px));
}
.scope-selection-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 12px;
}
.scope-selection-heading span {
  color: var(--bc-muted);
}
.scope-store-list {
  max-height: min(340px, 44svh);
  overflow-y: auto;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}
.scope-store-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: 12px 16px;
}

.table-tools {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.table-tools .n-input {
  max-width: 360px;
}
.status-filter {
  width: 130px;
}
.role-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
}
.role-card {
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}
.role-card > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.role-card p {
  min-height: 20px;
  margin: 8px 0;
  color: #64748b;
}
.role-card-footer span {
  color: #94a3b8;
  font-size: 12px;
}
.permission-groups {
  display: grid;
  gap: 12px;
  width: 100%;
}
.permission-group {
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}
.permission-items {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px 16px;
  margin-top: 10px;
}
.user-cell,
.login-time,
.scope-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.user-cell small,
.login-time small,
.scope-cell small,
.muted {
  color: #94a3b8;
}
.log-modal {
  width: min(620px, calc(100vw - 32px));
  max-width: 620px;
}
.log-content {
  min-height: 280px;
}
.log-content :deep(.n-spin-content) {
  min-height: 280px;
}
.log-empty {
  display: flex;
  min-height: 280px;
  justify-content: center;
}
.log-title {
  font-weight: 700;
  color: #1e293b;
}
.log-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  color: #64748b;
  font-size: 13px;
  padding-top: 5px;
}
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
@media (max-width: 640px) {
  .table-tools {
    flex-direction: column;
  }
  .table-tools .n-input,
  .status-filter {
    width: 100%;
    max-width: none;
  }
  .permission-items {
    grid-template-columns: 1fr;
  }
}
</style>
