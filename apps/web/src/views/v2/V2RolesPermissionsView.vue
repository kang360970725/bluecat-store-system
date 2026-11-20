<template>
  <div class="page-stack">
    <div class="section-head">
      <h1>角色与权限</h1>
      <n-space>
        <n-button :loading="loading" @click="loadAll">刷新</n-button>
        <n-button type="primary" @click="openCreateRole">新增角色</n-button>
      </n-space>
    </div>
    <n-card :bordered="false">
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
      v-model:show="permissionModalOpen"
      preset="card"
      :title="permissionTitle"
      class="bc-modal-lg"
      content-style="max-height: calc(100svh - 190px); overflow-y: auto;"
    >
      <n-spin :show="permissionLoading">
        <template v-if="permissionAudit">
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

  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { NTree, useMessage } from 'naive-ui';
import {
  createV2Role,
  getV2RoleCatalog,
  getV2RolePermissionAudit,
  updateV2Role,
  type V2RoleCatalog,
  type V2RolePermissionAudit
} from '@/api/v2-master-data';

const message = useMessage();
const permissionModalOpen = ref(false);
const permissionLoading = ref(false);
const permissionTitle = ref('');
const permissionAudit = ref<V2RolePermissionAudit[]>();


function permissionDiff(after: string[], before: string[]) {
  return after
    .filter((code) => !before.includes(code))
    .map((code) => permissionLabel(code, code))
    .join('、');
}


const access = ref<V2RoleCatalog>();
const loading = ref(false);
const saving = ref(false);
const roleModalOpen = ref(false);
const editingRole = ref<V2RoleCatalog['roles'][number] | null>(null);
const roleForm = ref({ name: '', description: '', permissionCodes: [] as string[] });

async function loadAll() {
  loading.value = true;
  try {
    access.value = await getV2RoleCatalog();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '加载角色失败');
  } finally {
    loading.value = false;
  }
}

async function openRoleAudit(id: string, name: string) {
  if (permissionLoading.value) return;
  permissionTitle.value = `权限变更 · ${name}`;
  permissionAudit.value = undefined;
  permissionModalOpen.value = true;
  permissionLoading.value = true;
  try {
    permissionAudit.value = await getV2RolePermissionAudit(id);
  } catch (error) {
    message.error(error instanceof Error ? error.message : '加载权限记录失败');
  } finally {
    permissionLoading.value = false;
  }
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
        ? '角色权限已更新'
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

function openEditRole(role: V2RoleCatalog['roles'][number]) {
  if (role.code === 'super_admin') return;
  editingRole.value = role;
  roleForm.value = {
    name: role.name,
    description: role.description ?? '',
    permissionCodes: role.permissions.map((item) => item.permission.code)
  };
  roleModalOpen.value = true;
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

onMounted(loadAll);
</script>

<style scoped>
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
</style>
