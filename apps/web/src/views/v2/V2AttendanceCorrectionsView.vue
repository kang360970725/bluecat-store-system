<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { request } from '@/api/http';

interface Correction {
  id: string;
  kind: 'IN' | 'OUT';
  requestedTime: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewerName: string | null;
  assignment: {
    workDate: string;
    employee: { name: string };
    period: { store: { name: string } };
  };
}

const mode = ref<'PENDING' | 'HISTORY'>('PENDING');
const rows = ref<Correction[]>([]);
const selected = ref<Correction>();
const note = ref('');
const message = ref('');
const busy = ref(false);
const time = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Shanghai'
});

async function load() {
  busy.value = true;
  message.value = '';
  try {
    rows.value = await request<Correction[]>(
      `/v2/attendance/corrections?mode=${mode.value}`
    );
  } catch (error) {
    message.value = (error as Error).message;
  } finally {
    busy.value = false;
  }
}

function browse(value: 'PENDING' | 'HISTORY') {
  mode.value = value;
  rows.value = [];
  void load();
}

function select(row: Correction) {
  selected.value = row;
  note.value = '';
  message.value = '';
}

async function review(approved: boolean) {
  if (!selected.value || !note.value.trim() || busy.value) return;
  busy.value = true;
  message.value = '';
  try {
    await request(`/v2/attendance/corrections/${selected.value.id}/review`, {
      method: 'POST',
      body: JSON.stringify({ approved, note: note.value.trim() })
    });
    selected.value = undefined;
    await load();
  } catch (error) {
    message.value = (error as Error).message;
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-xl font-semibold">考勤补卡审批</h1>
    <n-space>
      <n-button
        :type="mode === 'PENDING' ? 'primary' : 'default'"
        :disabled="busy"
        @click="browse('PENDING')"
        >待审批</n-button
      >
      <n-button
        :type="mode === 'HISTORY' ? 'primary' : 'default'"
        :disabled="busy"
        @click="browse('HISTORY')"
        >审核历史</n-button
      >
      <n-button :disabled="busy" @click="load">刷新</n-button>
    </n-space>
    <p v-if="mode === 'HISTORY'">显示最近 100 条处理记录。</p>
    <p v-if="message" role="alert">{{ message }}</p>
    <p v-if="!busy && !message && !rows.length">
      暂无{{ mode === 'PENDING' ? '待审批申请' : '审核历史' }}
    </p>
    <n-card
      v-for="row in rows"
      :key="row.id"
      size="small"
      :title="row.assignment.employee.name"
    >
      <p>
        {{ row.assignment.period.store.name }} · 排班日
        {{ row.assignment.workDate.slice(0, 10) }}
      </p>
      <p>
        {{ row.kind === 'IN' ? '上班' : '下班' }}补卡 ·
        {{ time.format(new Date(row.requestedTime)) }}
      </p>
      <p>{{ row.reason }}</p>
      <n-button
        v-if="row.status === 'PENDING'"
        :disabled="busy"
        @click="select(row)"
        >审核</n-button
      >
      <template v-else>
        <p>
          {{ row.status === 'APPROVED' ? '已通过' : '已驳回或自动关闭' }} ·
          {{ row.reviewerName || '系统'
          }}<template v-if="row.reviewedAt">
            · {{ time.format(new Date(row.reviewedAt)) }}</template
          >
        </p>
        <p v-if="row.reviewNote">处理说明：{{ row.reviewNote }}</p>
      </template>
    </n-card>
    <n-modal
      :show="Boolean(selected)"
      :mask-closable="false"
      @update:show="selected = undefined"
    >
      <n-card title="补卡审批" style="width: min(480px, 92vw)">
        <p>{{ selected?.assignment.employee.name }} · {{ selected?.reason }}</p>
        <n-input
          v-model:value="note"
          type="textarea"
          :maxlength="500"
          placeholder="审核说明"
        />
        <p v-if="message" role="alert">{{ message }}</p>
        <n-space class="mt-4">
          <n-button :disabled="busy" @click="selected = undefined"
            >取消</n-button
          >
          <n-button :disabled="busy || !note.trim()" @click="review(false)"
            >驳回</n-button
          >
          <n-button
            type="primary"
            :disabled="busy || !note.trim()"
            @click="review(true)"
            >通过</n-button
          >
        </n-space>
      </n-card>
    </n-modal>
  </section>
</template>
