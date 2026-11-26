<script setup lang="ts">
import { NSelect } from '@/components/Select';
import { computed, onMounted, ref } from 'vue';
import { API_BASE_URL, request } from '@/api/http';
import { useAuthStore } from '@/stores/auth';

interface Counts {
  total: number;
  pending: number;
  claimed: number;
  submitted: number;
  done: number;
  overdue: number;
}

interface Report {
  asOf: string;
  canExport: boolean;
  stores: Array<{ id: string; name: string; status: string }>;
  total: Counts;
  rows: Array<Counts & { storeId: string; storeName: string }>;
}

const auth = useAuthStore();
const timeZone = 'Asia/Shanghai';
const dates = new Intl.DateTimeFormat('sv-SE', { timeZone });
const displayTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone,
  dateStyle: 'medium',
  timeStyle: 'short'
});
const to = ref(dates.format(new Date()));
const from = ref(dates.format(new Date(Date.now() - 6 * 86_400_000)));
const storeId = ref<string | null>(null);
const kind = ref<string | null>(null);
const report = ref<Report>();
const applied = ref('');
const busy = ref(false);
const errorMessage = ref('');
const path = '/v2/operational-tasks/report';
const kindOptions = [
  { label: '普通任务（含循环）', value: 'TASK' },
  { label: '整改任务', value: 'RECTIFICATION' }
];
const storeOptions = computed(
  () =>
    report.value?.stores.map((store) => ({
      value: store.id,
      label:
        store.status === 'OPERATING' ? store.name : `${store.name}（非营业）`
    })) ?? []
);
const query = computed(() => {
  const params = new URLSearchParams({ from: from.value, to: to.value });
  if (storeId.value) params.set('storeId', storeId.value);
  if (kind.value) params.set('kind', kind.value);
  return params.toString();
});
const rates = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  maximumFractionDigits: 1
});
const rate = (counts: Counts) =>
  counts.total ? rates.format(counts.done / counts.total) : '—';

async function run(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  errorMessage.value = '';
  try {
    await action();
  } catch (error) {
    errorMessage.value = (error as Error).message;
  } finally {
    busy.value = false;
  }
}

function load() {
  return run(async () => {
    const filters = query.value;
    report.value = await request<Report>(`${path}?${filters}`);
    applied.value = filters;
  });
}

function download() {
  if (!report.value?.canExport || applied.value !== query.value) return;
  return run(async () => {
    const response = await fetch(
      `${API_BASE_URL}${path}.csv?${applied.value}`,
      {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
        cache: 'no-store'
      }
    );
    if (
      !response.ok ||
      !response.headers.get('content-type')?.startsWith('text/csv')
    ) {
      const body = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      throw new Error(body?.message ?? '导出失败，请刷新权限或重新登录');
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = `运营任务-${from.value}-${to.value}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

onMounted(() => void load());
</script>

<template>
  <section class="space-y-4">
    <n-space align="center" justify="space-between">
      <h1 class="text-xl font-semibold">运营任务统计</h1>
      <RouterLink to="/v2/operational-tasks">返回运营任务</RouterLink>
    </n-space>
    <form @submit.prevent="load">
      <n-space align="center">
        <label
          >截止日期从
          <input v-model="from" type="date" required :disabled="busy"
        /></label>
        <label
          >到 <input v-model="to" type="date" required :disabled="busy"
        /></label>
        <n-select
          v-model:value="storeId"
          :options="storeOptions"
          clearable
          placeholder="全部授权门店"
          style="width: 200px"
          :disabled="busy"
        />
        <n-select
          v-model:value="kind"
          :options="kindOptions"
          clearable
          placeholder="全部类型"
          style="width: 170px"
          :disabled="busy"
        />
        <n-button attr-type="submit" type="primary" :loading="busy"
          >查询</n-button
        >
        <n-button
          :disabled="busy || !report?.canExport || query !== applied"
          @click="download"
          >导出任务明细 CSV</n-button
        >
      </n-space>
    </form>
    <p>
      按北京时间的任务截止日期统计，最多查询 93
      天。完成率为已确认完成数除以任务总数。
    </p>
    <p v-if="report && query === applied && !report.canExport">
      当前门店范围可查看统计。如需导出，请选择具备导出权限的门店。
    </p>
    <n-alert v-if="errorMessage" type="error">{{ errorMessage }}</n-alert>
    <template v-if="report && query === applied">
      <p>
        统计时点：{{
          displayTime.format(new Date(report.asOf))
        }}。逾期指超过截止时间且仍待认领或执行中的任务。
      </p>
      <div class="overflow-x-auto">
        <n-table striped>
          <thead>
            <tr>
              <th>门店</th>
              <th>任务总数</th>
              <th>待认领</th>
              <th>执行中</th>
              <th>待确认</th>
              <th>已完成</th>
              <th>已逾期</th>
              <th>完成率</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>合计</th>
              <td>{{ report.total.total }}</td>
              <td>{{ report.total.pending }}</td>
              <td>{{ report.total.claimed }}</td>
              <td>{{ report.total.submitted }}</td>
              <td>{{ report.total.done }}</td>
              <td>{{ report.total.overdue }}</td>
              <td>{{ rate(report.total) }}</td>
            </tr>
            <tr v-for="row in report.rows" :key="row.storeId">
              <td>{{ row.storeName }}</td>
              <td>{{ row.total }}</td>
              <td>{{ row.pending }}</td>
              <td>{{ row.claimed }}</td>
              <td>{{ row.submitted }}</td>
              <td>{{ row.done }}</td>
              <td>{{ row.overdue }}</td>
              <td>{{ rate(row) }}</td>
            </tr>
            <tr v-if="!report.rows.length">
              <td colspan="8">当前范围暂无任务</td>
            </tr>
          </tbody>
        </n-table>
      </div>
    </template>
  </section>
</template>
