<template>
  <n-layout :has-sider="!isMobile" class="app-shell">
    <n-layout-sider
      v-if="!isMobile"
      bordered
      :width="248"
      class="desktop-sider"
    >
      <div class="brand">
        <span class="brand-mark">B</span><span>蓝猫门店运营</span>
      </div>
      <n-menu
        v-model:expanded-keys="expandedKeys"
        :value="activeMenuKey"
        :options="menuOptions"
      />
    </n-layout-sider>
    <n-drawer
      v-model:show="mobileMenuOpen"
      placement="left"
      :width="Math.min(320, viewportWidth - 28)"
    >
      <n-drawer-content
        :native-scrollbar="false"
        body-content-style="padding: 12px"
      >
        <template #header>
          <div class="brand mobile-brand">
            <span class="brand-mark">B</span><span>蓝猫门店运营</span>
          </div>
        </template>
        <n-menu
          v-model:expanded-keys="expandedKeys"
          :value="activeMenuKey"
          :options="menuOptions"
        />
      </n-drawer-content>
    </n-drawer>
    <n-layout>
      <n-layout-header bordered class="topbar">
        <div class="topbar-main">
          <n-button
            v-if="isMobile"
            quaternary
            circle
            aria-label="打开导航"
            @click="mobileMenuOpen = true"
          >
            <span class="menu-icon">☰</span>
          </n-button>
          <div>
            <div class="page-title">门店运营后台</div>
            <div class="page-subtitle">经营数据与门店协同中心</div>
          </div>
        </div>
        <n-space align="center"
          ><n-select
            v-if="storeOptions.length > 1"
            :value="auth.user?.storeId"
            :options="storeOptions"
            :loading="switchingStore"
            class="store-switcher"
            placeholder="切换门店"
            @update:value="changeActiveStore"
          /><n-button
            secondary
            :size="isMobile ? 'small' : 'medium'"
            @click="logout"
            >退出</n-button
          ></n-space
        >
      </n-layout-header>
      <n-layout-content class="content" :class="{ 'content-mobile': isMobile }">
        <router-view v-slot="{ Component, route: currentRoute }">
          <div
            :key="currentRoute.fullPath"
            v-motion-fade-visible-once
            class="route-stage"
          >
            <component :is="Component" />
          </div>
        </router-view>
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>

<script setup lang="ts">
import { NDrawerContent, NDrawer, NMenu, NSelect } from 'naive-ui';
import { computed, h, onMounted, ref, watch } from 'vue';
import {
  breakpointsTailwind,
  useBreakpoints,
  useWindowSize
} from '@vueuse/core';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { switchStore } from '@/api/auth';
import { getV2MasterDataOverview } from '@/api/v2-master-data';
import { storeDisplayName } from '@/utils/store-display';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const expandedKeys = ref<string[]>([]);
const mobileMenuOpen = ref(false);
const storeOptions = ref<Array<{ label: string; value: string }>>([]);
const switchingStore = ref(false);
const breakpoints = useBreakpoints(breakpointsTailwind);
const isMobile = breakpoints.smaller('md');
const { width: viewportWidth } = useWindowSize();
const routeMenuMap: Record<string, { key: string; parent?: string }> = {
  '/': { key: 'v2-store-center', parent: 'business-group' },
  '/v2-foundation': { key: 'v2-store-center', parent: 'business-group' },
  '/v2/stores': { key: 'v2-store-center', parent: 'business-group' },
  '/v2/settings/positions': {
    key: 'v2-position-settings',
    parent: 'people-group'
  },
  '/v2/operations': { key: 'v2-operations', parent: 'business-group' },
  '/v2/operations-dashboard': {
    key: 'v2-operations-dashboard',
    parent: 'business-group'
  },
  '/v2/usage-analytics': {
    key: 'v2-usage-analytics',
    parent: 'business-group'
  },
  '/v2/recharge-contest': {
    key: 'v2-recharge-contest',
    parent: 'business-group'
  },
  '/v2/operational-tasks': { key: 'v2-operational-tasks' },
  '/v2/operational-tasks/report': { key: 'v2-operational-tasks' },
  '/v2/attendance-records': {
    key: 'v2-attendance-records',
    parent: 'attendance-group'
  },
  '/v2/attendance-corrections': {
    key: 'v2-attendance-corrections',
    parent: 'attendance-group'
  },
  '/v2/employees': { key: 'v2-employees', parent: 'people-group' },
  '/v2/settings/login-users': {
    key: 'v2-login-users',
    parent: 'system-group'
  },
  '/v2/settings/payroll-grades': {
    key: 'v2-payroll-grades',
    parent: 'people-group'
  },
  '/v2/finance/payroll': { key: 'v2-finance-payroll', parent: 'finance-group' }
};

const activeMenuMeta = computed(() =>
  route.path.startsWith('/v2/stores/')
    ? { key: 'v2-store-center', parent: 'business-group' }
    : route.path.startsWith('/v2/schedules/')
      ? { key: 'v2-operations', parent: 'business-group' }
      : (routeMenuMap[route.path] ?? routeMenuMap['/'])
);
const activeMenuKey = computed(() => activeMenuMeta.value.key);

const menuOptions = computed(() =>
  [
    hasPermission('store:view') || hasPermission('performance:view')
      ? {
          label: '门店运营',
          key: 'business-group',
          children: [
            hasPermission('performance:view')
              ? {
                  label: () =>
                    h(
                      RouterLink,
                      { to: '/v2/operations-dashboard' },
                      { default: () => '运营看板' }
                    ),
                  key: 'v2-operations-dashboard'
                }
              : null,
            hasPermission('performance:view')
              ? {
                  label: () =>
                    h(
                      RouterLink,
                      { to: '/v2/usage-analytics' },
                      { default: () => '上机分析' }
                    ),
                  key: 'v2-usage-analytics'
                }
              : null,
            hasPermission('store:view')
              ? {
                  label: () =>
                    h(
                      RouterLink,
                      { to: '/v2/stores' },
                      { default: () => '门店中心' }
                    ),
                  key: 'v2-store-center'
                }
              : null,
            hasPermission('store:view')
              ? {
                  label: () =>
                    h(
                      RouterLink,
                      { to: '/v2/operations' },
                      { default: () => '运营配置' }
                    ),
                  key: 'v2-operations'
                }
              : null,
            hasPermission('store:view')
              ? {
                  label: () =>
                    h(
                      RouterLink,
                      { to: '/v2/recharge-contest' },
                      { default: () => '充值比武榜' }
                    ),
                  key: 'v2-recharge-contest'
                }
              : null
          ].filter((option) => option !== null)
        }
      : null,
    hasPermission('employee:view')
      ? {
          label: '组织与人员',
          key: 'people-group',
          children: [
            {
              label: () =>
                h(
                  RouterLink,
                  { to: '/v2/employees' },
                  { default: () => '员工档案' }
                ),
              key: 'v2-employees'
            },
            hasPermission('permission:update')
              ? {
                  label: () =>
                    h(
                      RouterLink,
                      { to: '/v2/settings/positions' },
                      { default: () => '岗位体系' }
                    ),
                  key: 'v2-position-settings'
                }
              : null,
            hasPermission('employee.grade:view')
              ? {
                  label: () =>
                    h(
                      RouterLink,
                      { to: '/v2/settings/payroll-grades' },
                      { default: () => '职级维护' }
                    ),
                  key: 'v2-payroll-grades'
                }
              : null
          ].filter((option) => option !== null)
        }
      : null,
    hasPermission('finance.payroll:view_summary')
      ? {
          label: '财务管理',
          key: 'finance-group',
          children: [
            {
              label: () =>
                h(
                  RouterLink,
                  { to: '/v2/finance/payroll' },
                  { default: () => '工资核算' }
                ),
              key: 'v2-finance-payroll'
            }
          ]
        }
      : null,
    {
      label: () =>
        h(
          RouterLink,
          { to: '/v2/operational-tasks' },
          { default: () => '运营任务' }
        ),
      key: 'v2-operational-tasks'
    },
    hasPermission('attendance:view') || hasPermission('attendance:review')
      ? {
          label: '员工考勤',
          key: 'attendance-group',
          children: [
            hasPermission('attendance:view')
              ? {
                  label: () =>
                    h(
                      RouterLink,
                      { to: '/v2/attendance-records' },
                      { default: () => '考勤记录' }
                    ),
                  key: 'v2-attendance-records'
                }
              : null,
            hasPermission('attendance:review')
              ? {
                  label: () =>
                    h(
                      RouterLink,
                      { to: '/v2/attendance-corrections' },
                      { default: () => '补卡审批' }
                    ),
                  key: 'v2-attendance-corrections'
                }
              : null
          ].filter((option) => option !== null)
        }
      : null,
    auth.user?.roles.includes('super_admin')
      ? {
          label: '系统管理',
          key: 'system-group',
          children: [
            {
              label: () =>
                h(
                  RouterLink,
                  { to: '/v2/settings/login-users' },
                  { default: () => '账号与角色' }
                ),
              key: 'v2-login-users'
            }
          ]
        }
      : null
  ].filter((option) => option !== null)
);

function hasPermission(permission: string) {
  return (
    auth.user?.roles.includes('super_admin') ||
    auth.user?.permissions.includes(permission)
  );
}

watch(
  activeMenuMeta,
  (meta) => {
    if (!meta.parent) {
      return;
    }
    expandedKeys.value = Array.from(
      new Set([...expandedKeys.value, meta.parent])
    );
  },
  { immediate: true }
);

watch(
  () => route.fullPath,
  () => {
    mobileMenuOpen.value = false;
  }
);

function logout() {
  auth.clearSession();
  router.push('/login');
}
async function loadStoreOptions() {
  try {
    const data = await getV2MasterDataOverview();
    storeOptions.value = data.stores.map((item) => ({
      label: storeDisplayName(item),
      value: item.id
    }));
  } catch {
    storeOptions.value = [];
  }
}
async function changeActiveStore(storeId: string) {
  switchingStore.value = true;
  try {
    auth.setSession(await switchStore(storeId));
    await router.push(`/v2/stores/${storeId}`);
  } finally {
    switchingStore.value = false;
  }
}
onMounted(() => void loadStoreOptions());
</script>

<style scoped>
.desktop-sider {
  box-shadow: 10px 0 34px rgba(15, 23, 42, 0.035);
}

.mobile-brand {
  height: auto;
  padding: 0;
}

.topbar-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.store-switcher {
  width: 180px;
}

.menu-icon {
  font-size: 20px;
  line-height: 1;
}

.route-stage {
  min-width: 0;
}

.bridge-health-alert {
  margin: 12px 24px 0;
}

.bridge-health-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.bridge-health-content .n-button {
  flex: none;
}

@media (max-width: 767px) {
  .bridge-health-alert {
    margin: 8px 12px 0;
  }

  .bridge-health-content {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }

  .bridge-health-content .n-button {
    width: 100%;
  }
}
</style>
