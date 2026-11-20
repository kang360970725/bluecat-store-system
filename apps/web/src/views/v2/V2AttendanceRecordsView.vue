<script setup lang="ts">
import { NSelect } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { API_BASE_URL, request } from '@/api/http';
import { useAuthStore } from '@/stores/auth';

interface Punch {
  kind: 'IN' | 'OUT';
  punchedAt: string;
  terminalId: string | null;
  wifiNetworkId: string | null;
}

interface RecordRow {
  id: string;
  employee: { name: string; employeeNo: string };
  period: { store: { name: string } };
  shift: {
    name: string;
    startsAt: string;
    endsAt: string;
    spansNextDay: boolean;
  };
  attendancePunches: Punch[];
}

interface RecordsResult {
  stores: Array<{ id: string; name: string }>;
  rows: RecordRow[];
  hasNext: boolean;
  canExport: boolean;
}

const timeZone = 'Asia/Shanghai';
const date = ref(
  new Intl.DateTimeFormat('sv-SE', { timeZone }).format(new Date())
);
const auth = useAuthStore();
const exportMonth = ref(date.value.slice(0, 7));
const storeId = ref<string | null>(null);
const busy = ref(false);
const message = ref('');
const page = ref(1);
const result = ref<RecordsResult>();
const storeOptions = computed(
  () =>
    result.value?.stores.map((store) => ({
      value: store.id,
      label: store.name
    })) ?? []
);
const time = new Intl.DateTimeFormat('zh-CN', {
  timeZone,
  dateStyle: 'short',
  timeStyle: 'short'
});

function punchText(row: RecordRow, kind: Punch['kind']) {
  const punch = row.attendancePunches.find((item) => item.kind === kind);
  if (!punch) return '暂无记录';
  const source = punch.wifiNetworkId
    ? 'Wi-Fi'
    : punch.terminalId
      ? '扫码（历史）'
      : '补卡';
  return `${time.format(new Date(punch.punchedAt))}（${source}）`;
}

async function load(nextPage = 1) {
  if (busy.value || !date.value) return;
  busy.value = true;
  message.value = '';
  const query = new URLSearchParams({
    workDate: date.value,
    page: String(nextPage)
  });
  if (storeId.value) query.set('storeId', storeId.value);
  try {
    result.value = await request<RecordsResult>(
      `/v2/attendance/records?${query}`
    );
    page.value = nextPage;
  } catch (error) {
    message.value = (error as Error).message;
  } finally {
    busy.value = false;
  }
}

async function downloadMonth() {
  if (busy.value || !result.value?.canExport || !exportMonth.value) return;
  busy.value = true;
  message.value = '';
  const query = new URLSearchParams({ month: exportMonth.value });
  if (storeId.value) query.set('storeId', storeId.value);
  try {
    const response = await fetch(
      `${API_BASE_URL}/v2/attendance/records.csv?${query}`,
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
      throw new Error(body?.message ?? '导出失败，请重新查询');
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = `考勤-${exportMonth.value}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    message.value = (error as Error).message;
  } finally {
    busy.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-xl font-semibold">考勤记录</h1>
    <form @submit.prevent="load()">
      <n-space align="center">
        <label
          >排班日期
          <input
            v-model="date"
            type="date"
            required
            :disabled="busy"
            @change="load()"
        /></label>
        <n-select
          v-model:value="storeId"
          :options="storeOptions"
          clearable
          placeholder="全部授权门店"
          style="width: 220px"
          :disabled="busy"
          @update:value="load()"
        />
        <n-button attr-type="submit" :loading="busy">查询</n-button>
      </n-space>
    </form>
    <n-space align="center">
      <label
        >导出月份 <input v-model="exportMonth" type="month" :disabled="busy"
      /></label>
      <n-button
        :disabled="busy || !result?.canExport || !exportMonth"
        @click="downloadMonth"
        >导出月度明细 CSV</n-button
      >
      <span v-if="result && !result.canExport">请选择已获导出权限的门店。</span>
    </n-space>
    <n-alert v-if="message" type="error">{{ message }}</n-alert>
    <template v-else-if="result">
      <div class="overflow-x-auto">
        <n-table striped>
          <thead>
            <tr>
              <th>员工</th>
              <th>门店</th>
              <th>班次</th>
              <th>上班卡</th>
              <th>下班卡</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in result.rows" :key="row.id">
              <td>{{ row.employee.name }} · {{ row.employee.employeeNo }}</td>
              <td>{{ row.period.store.name }}</td>
              <td>
                {{ row.shift.name }} {{ row.shift.startsAt }}–{{
                  row.shift.spansNextDay ? '次日 ' : ''
                }}{{ row.shift.endsAt }}
              </td>
              <td>{{ punchText(row, 'IN') }}</td>
              <td>{{ punchText(row, 'OUT') }}</td>
            </tr>
            <tr v-if="!result.rows.length">
              <td colspan="5">当日暂无已发布或锁定的排班</td>
            </tr>
          </tbody>
        </n-table>
      </div>
      <n-space align="center">
        <n-button :disabled="busy || page <= 1" @click="load(page - 1)"
          >上一页</n-button
        >
        <span>第 {{ page }} 页</span>
        <n-button :disabled="busy || !result.hasNext" @click="load(page + 1)"
          >下一页</n-button
        >
      </n-space>
    </template>
  </section>
</template>
