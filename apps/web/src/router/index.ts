import { createRouter, createWebHistory } from 'vue-router';
import BasicLayout from '@/layouts/BasicLayout.vue';
import DashboardView from '@/views/DashboardView.vue';
import LoginView from '@/views/LoginView.vue';
import PerformanceSplitsView from '@/views/performance/PerformanceSplitsView.vue';
import SchedulesView from '@/views/performance/SchedulesView.vue';
import ShiftDashboardView from '@/views/performance/ShiftDashboardView.vue';
import StoreScoringView from '@/views/scoring/StoreScoringView.vue';
import PerformanceView from '@/views/store/PerformanceView.vue';
import StoreAreasView from '@/views/store/StoreAreasView.vue';
import StoreEmployeesView from '@/views/store/StoreEmployeesView.vue';
import PositionsView from '@/views/store/PositionsView.vue';
import StoresView from '@/views/store/StoresView.vue';
import { useAuthStore } from '@/stores/auth';

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
      path: '/',
      component: BasicLayout,
      children: [
        {
          path: '',
          name: 'dashboard',
          component: DashboardView
        },
        {
          path: 'stores',
          name: 'stores',
          component: StoresView
        },
        {
          path: 'store-employees',
          name: 'store-employees',
          component: StoreEmployeesView
        },
        {
          path: 'store-areas',
          name: 'store-areas',
          component: StoreAreasView
        },
        {
          path: 'performance',
          name: 'performance',
          component: PerformanceView
        },
        {
          path: 'shift-dashboard',
          name: 'shift-dashboard',
          component: ShiftDashboardView
        },
        {
          path: 'performance-splits',
          name: 'performance-splits',
          component: PerformanceSplitsView
        },
        {
          path: 'schedules',
          name: 'schedules',
          component: SchedulesView
        },
        {
          path: 'store-scoring',
          name: 'store-scoring',
          component: StoreScoringView
        },
        {
          path: 'positions',
          name: 'positions',
          component: PositionsView
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

  if (to.path === '/login' && auth.isAuthenticated) {
    return '/';
  }
});
