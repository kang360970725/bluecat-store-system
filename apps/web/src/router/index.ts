import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const BasicLayout = () => import('@/layouts/BasicLayout.vue');
const LoginView = () => import('@/views/LoginView.vue');
const V2StoreCenterView = () => import('@/views/v2/V2StoreCenterView.vue');
const V2StoreWorkspaceView = () =>
  import('@/views/v2/V2StoreWorkspaceView.vue');
const V2PositionSettingsView = () =>
  import('@/views/v2/V2PositionSettingsView.vue');
const V2OperationsView = () => import('@/views/v2/V2OperationsView.vue');
const V2OperationsDashboardView = () =>
  import('@/views/v2/V2OperationsDashboardView.vue');
const V2UsageAnalyticsView = () =>
  import('@/views/v2/V2UsageAnalyticsView.vue');
const V2EmployeeCenterView = () =>
  import('@/views/v2/V2EmployeeCenterView.vue');
const V2RolesPermissionsView = () =>
  import('@/views/v2/V2RolesPermissionsView.vue');
const V2PayrollGradesView = () => import('@/views/v2/V2PayrollGradesView.vue');
const ChangePasswordView = () => import('@/views/ChangePasswordView.vue');
const V2ScheduleEditorView = () =>
  import('@/views/v2/V2ScheduleEditorView.vue');
const V2RechargeContestView = () =>
  import('@/views/v2/V2RechargeContestView.vue');
const V2FinancePayrollView = () =>
  import('@/views/v2/V2FinancePayrollView.vue');

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: {
        public: true
      }
    },
    {
      path: '/change-password',
      name: 'change-password',
      component: ChangePasswordView
    },
    {
      path: '/',
      component: BasicLayout,
      children: [
        {
          path: '',
          redirect: '/v2/stores'
        },
        {
          path: 'v2-foundation',
          redirect: '/v2/stores'
        },
        {
          path: 'v2/attendance-settings',
          name: 'v2-attendance-settings',
          component: () => import('@/views/v2/V2AttendanceTerminalsView.vue'),
          meta: { superAdminOnly: true }
        },
        {
          path: 'v2/operational-tasks/report',
          name: 'v2-operational-tasks-report',
          component: () => import('@/views/v2/V2OperationalTasksReportView.vue')
        },
        {
          path: 'v2/operational-tasks',
          name: 'v2-operational-tasks',
          component: () => import('@/views/v2/V2OperationalTasksView.vue')
        },
        {
          path: 'v2/attendance-records',
          name: 'v2-attendance-records',
          component: () => import('@/views/v2/V2AttendanceRecordsView.vue'),
          meta: { permission: 'attendance:view' }
        },
        {
          path: 'v2/attendance-corrections',
          name: 'v2-attendance-corrections',
          component: () => import('@/views/v2/V2AttendanceCorrectionsView.vue'),
          meta: { permission: 'attendance:review' }
        },
        {
          path: 'v2/stores',
          name: 'v2-store-center',
          component: V2StoreCenterView
        },
        {
          path: 'v2/stores/:storeId',
          name: 'v2-store-workspace',
          component: V2StoreWorkspaceView
        },
        {
          path: 'v2/settings/positions',
          name: 'v2-position-settings',
          component: V2PositionSettingsView
        },
        {
          path: 'v2/operations',
          name: 'v2-operations',
          component: V2OperationsView
        },
        {
          path: 'v2/operations-dashboard',
          name: 'v2-operations-dashboard',
          component: V2OperationsDashboardView,
          meta: { permission: 'performance:view' }
        },
        {
          path: 'v2/usage-analytics',
          name: 'v2-usage-analytics',
          component: V2UsageAnalyticsView,
          meta: { permission: 'performance:view' }
        },
        {
          path: 'v2/recharge-contest',
          name: 'v2-recharge-contest',
          component: V2RechargeContestView
        },
        {
          path: 'v2/finance/payroll',
          name: 'v2-finance-payroll',
          component: V2FinancePayrollView
        },
        {
          path: 'v2/employees',
          name: 'v2-employee-center',
          component: V2EmployeeCenterView
        },
        {
          path: 'v2/settings/roles',
          alias: 'v2/settings/login-users',
          name: 'v2-roles-permissions',
          component: V2RolesPermissionsView
        },
        {
          path: 'v2/settings/payroll-grades',
          name: 'v2-payroll-grades',
          component: V2PayrollGradesView
        },
        {
          path: 'v2/schedules/:id',
          name: 'v2-schedule-editor',
          component: V2ScheduleEditorView
        }
      ]
    }
  ]
});

router.beforeEach((to) => {
  const auth = useAuthStore();

  if (!to.meta.public && !auth.isAuthenticated) {
    return {
      path: '/login',
      query: {
        redirect: to.fullPath
      }
    };
  }
  if (
    auth.isAuthenticated &&
    auth.user?.mustChangePassword &&
    to.path !== '/change-password'
  )
    return '/change-password';
  if (
    auth.isAuthenticated &&
    !auth.user?.mustChangePassword &&
    to.path === '/change-password'
  )
    return '/';

  if (to.path === '/login' && auth.isAuthenticated) {
    return '/';
  }
  if (
    to.name === 'v2-store-workspace' &&
    auth.user &&
    !auth.user.roles.includes('super_admin') &&
    (!auth.user.permissions.includes('store:view') ||
      !auth.user.accessibleStoreIds.includes(String(to.params.storeId)))
  )
    return { name: 'v2-store-center', query: to.query };
  if (to.meta.superAdminOnly && !auth.user?.roles.includes('super_admin'))
    return '/v2/stores';
  const permission =
    typeof to.meta.permission === 'string' ? to.meta.permission : '';
  if (
    permission &&
    auth.isAuthenticated &&
    !auth.user?.roles.includes('super_admin') &&
    !auth.user?.permissions.includes(permission)
  ) {
    return '/v2/stores';
  }
});
