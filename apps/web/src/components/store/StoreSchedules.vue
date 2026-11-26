<template>
  <div class="store-schedules">
    <div class="schedule-toolbar">
      <div>
        <strong>门店排班</strong>
        <span>由本店负责人维护班次、排班和发布</span>
      </div>
      <n-space>
        <n-date-picker
          v-model:formatted-value="month"
          type="month"
          value-format="yyyy-MM"
          :clearable="false"
          @update:formatted-value="load"
        />
        <n-button secondary @click="load">刷新</n-button>
        <n-button v-if="canManage" type="primary" @click="createMonth">
          创建本月排班
        </n-button>
      </n-space>
    </div>
    <n-alert type="info" :bordered="false">
      收银和外场可在排班页一键套用「白白夜夜休休」三人错相轮班；客服、吧员和机动岗的时间由门店自定义。
    </n-alert>
    <n-spin :show="loading">
      <div v-if="periods.length" class="period-grid">
        <button
          v-for="period in periods"
          :key="period.id"
          type="button"
          class="period-card"
          @click="router.push(`/v2/schedules/${period.id}`)"
        >
          <span class="period-status" :class="period.status.toLowerCase()">
            {{ statusText[period.status] }}
          </span>
          <strong
            >{{ shortDate(period.startsOn) }} 至
            {{ shortDate(period.endsOn) }}</strong
          >
          <small>{{ period._count.assignments }} 条排班记录</small>
          <b>进入排班 →</b>
        </button>
      </div>
      <n-empty v-else description="所选月份还没有排班周期" />
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { useAuthStore } from '@/stores/auth';
import {
  createV2Schedule,
  getV2StoreSchedules,
  type V2SchedulePeriodSummary
} from '@/api/v2-operations';

const props = defineProps<{ storeId: string }>();
const router = useRouter();
const message = useMessage();
const auth = useAuthStore();
const month = ref(
  new Date()
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
    .slice(0, 7)
);
const periods = ref<V2SchedulePeriodSummary[]>([]);
const loading = ref(false);
const canManage = computed(
  () =>
    auth.user?.roles.includes('super_admin') ||
    auth.user?.permissions.includes('schedule:update')
);
const statusText = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  LOCKED: '已锁定'
} as const;

function shortDate(value: string) {
  return value.slice(5, 10).replace('-', '月') + '日';
}

async function load() {
  if (!month.value) return;
  loading.value = true;
  try {
    periods.value = await getV2StoreSchedules(props.storeId, month.value);
  } finally {
    loading.value = false;
  }
}

async function createMonth() {
  if (!month.value) return;
  const startsOn = `${month.value}-01`;
  const [year, value] = month.value.split('-').map(Number);
  const endsOn = new Date(Date.UTC(year, value, 0)).toISOString().slice(0, 10);
  loading.value = true;
  try {
    const created = (await createV2Schedule({
      storeId: props.storeId,
      startsOn,
      endsOn
    })) as { id: string };
    message.success('本月排班已创建');
    await router.push(`/v2/schedules/${created.id}`);
  } finally {
    loading.value = false;
  }
}

onMounted(() => void load());
</script>

<style scoped>
.store-schedules {
  display: grid;
  gap: 18px;
}
.schedule-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}
.schedule-toolbar > div:first-child {
  display: grid;
  gap: 5px;
}
.schedule-toolbar strong {
  font-size: 18px;
}
.schedule-toolbar span {
  color: var(--bc-muted);
  font-size: 13px;
}
.period-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 16px;
}
.period-card {
  position: relative;
  display: grid;
  gap: 8px;
  padding: 20px;
  border: 1px solid var(--bc-border);
  border-radius: 16px;
  background: var(--bc-surface);
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.period-card:hover {
  border-color: #7da8e5;
  box-shadow: 0 10px 28px rgba(37, 83, 145, 0.1);
  transform: translateY(-1px);
}
.period-card strong {
  margin-top: 8px;
  font-size: 16px;
}
.period-card small {
  color: var(--bc-muted);
}
.period-card b {
  margin-top: 7px;
  color: #2864b8;
  font-size: 13px;
}
.period-status {
  justify-self: start;
  padding: 4px 10px;
  border-radius: 999px;
  background: #eef2f7;
  color: #607087;
  font-size: 12px;
}
.period-status.published {
  background: #e8f5ee;
  color: #23845e;
}
.period-status.locked {
  background: #fff1df;
  color: #a7660d;
}
@media (max-width: 760px) {
  .schedule-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
