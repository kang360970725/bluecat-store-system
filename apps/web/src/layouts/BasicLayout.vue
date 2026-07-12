<template>
  <n-layout has-sider class="app-shell">
    <n-layout-sider bordered collapse-mode="width" :collapsed-width="64" :width="232">
      <div class="brand">BlueCat</div>
      <n-menu
        v-model:expanded-keys="expandedKeys"
        :value="activeMenuKey"
        :options="menuOptions"
      />
    </n-layout-sider>
    <n-layout>
      <n-layout-header bordered class="topbar">
        <div class="page-title">门店运营后台</div>
        <n-button secondary @click="logout">退出</n-button>
      </n-layout-header>
      <n-layout-content class="content">
        <router-view />
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>

<script setup lang="ts">
import { computed, h, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const expandedKeys = ref<string[]>([]);

const routeMenuMap: Record<string, { key: string; parent?: string }> = {
  '/': { key: 'dashboard' },
  '/stores': { key: 'stores', parent: 'store-group' },
  '/store-employees': { key: 'store-employees', parent: 'store-group' },
  '/store-areas': { key: 'store-areas', parent: 'store-group' },
  '/positions': { key: 'positions', parent: 'store-group' },
  '/performance': { key: 'performance', parent: 'performance-group' },
  '/shift-dashboard': { key: 'shift-dashboard', parent: 'performance-group' },
  '/performance-splits': { key: 'performance-splits', parent: 'performance-group' },
  '/schedules': { key: 'schedules', parent: 'performance-group' },
  '/store-scoring': { key: 'store-scoring', parent: 'performance-group' }
};

const activeMenuMeta = computed(
  () => routeMenuMap[route.path] ?? routeMenuMap['/']
);
const activeMenuKey = computed(() => activeMenuMeta.value.key);

const menuOptions = computed(() => [
  {
    label: () => h(RouterLink, { to: '/' }, { default: () => '工作台' }),
    key: 'dashboard'
  },
  {
    label: '门店管理',
    key: 'store-group',
    children: [
      hasPermission('store:view')
        ? {
            label: () =>
              h(RouterLink, { to: '/stores' }, { default: () => '门店资料' }),
            key: 'stores'
          }
        : null,
      hasPermission('employee:view')
        ? {
            label: () =>
              h(RouterLink, { to: '/store-employees' }, { default: () => '门店员工' }),
            key: 'store-employees'
          }
        : null,
      hasPermission('store-area:view')
        ? {
            label: () =>
              h(RouterLink, { to: '/store-areas' }, { default: () => '区域与价格' }),
            key: 'store-areas'
          }
        : null,
      hasPermission('permission:view')
        ? {
            label: () =>
              h(RouterLink, { to: '/positions' }, { default: () => '岗位权限' }),
            key: 'positions'
          }
        : null
    ].filter(Boolean)
  },
  hasPermission('performance:view')
    ? {
        label: '业绩管理',
        key: 'performance-group',
        children: [
          {
            label: () =>
              h(RouterLink, { to: '/performance' }, { default: () => '业绩指标' }),
            key: 'performance'
          },
          {
            label: () =>
              h(RouterLink, { to: '/performance-splits' }, { default: () => '业绩拆分表' }),
            key: 'performance-splits'
          },
          {
            label: () => h(RouterLink, { to: '/schedules' }, { default: () => '门店排班' }),
            key: 'schedules'
          },
          hasPermission('scoring:view')
            ? {
                label: () =>
                  h(RouterLink, { to: '/store-scoring' }, { default: () => '门店评分' }),
                key: 'store-scoring'
              }
            : null,
          {
            label: () =>
              h(RouterLink, { to: '/shift-dashboard' }, { default: () => '当班看板' }),
            key: 'shift-dashboard'
          }
        ].filter(Boolean)
      }
    : null
].filter(Boolean));

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
    expandedKeys.value = Array.from(new Set([...expandedKeys.value, meta.parent]));
  },
  { immediate: true }
);

function logout() {
  auth.clearSession();
  router.push('/login');
}
</script>
