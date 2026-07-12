<template>
  <section class="page-stack">
    <div class="section-head">
      <div>
        <h1>当班看板</h1>
        <p>查看本日网费、商品目标达成和预计绩效分。</p>
      </div>
      <n-button secondary :loading="loading" @click="load">刷新</n-button>
    </div>

    <n-alert v-if="dashboard && !dashboard.active" type="warning">
      {{ dashboard.message }}
    </n-alert>

    <template v-if="dashboard?.active">
      <div class="metric-strip">
        <div>
          <span>门店</span>
          <strong>{{ dashboard.store.name }}</strong>
        </div>
        <div>
          <span>日期</span>
          <strong>{{ dashboard.date }}</strong>
        </div>
        <div>
          <span>预计绩效分</span>
          <strong>{{ dashboard.performanceScore }}</strong>
        </div>
        <div>
          <span>当前业绩</span>
          <strong>{{ money(dashboard.monthSummary.currentPerformance) }}</strong>
        </div>
        <div>
          <span>剩余业绩</span>
          <strong>{{ money(dashboard.monthSummary.remainingPerformance) }}</strong>
        </div>
      </div>

      <div class="shift-board-grid">
        <div v-for="row in dashboard.todayRows" :key="row.shift.id" class="shift-card">
          <div class="shift-card-head">
            <h3>{{ row.shift.name }}</h3>
            <n-tag type="info">{{ percent(row.totalCompletionRate) }}</n-tag>
          </div>
          <div class="shift-metric">
            <span>网费目标 / 已达成</span>
            <strong>{{ money(row.netFeeTarget) }} / {{ money(row.netFeeActual) }}</strong>
          </div>
          <div class="shift-metric">
            <span>商品目标 / 已达成</span>
            <strong>{{ money(row.productTarget) }} / {{ money(row.productActual) }}</strong>
          </div>
        </div>
      </div>

      <n-collapse>
        <n-collapse-item title="绩效分计算规则说明" name="rule">
          {{ dashboard.scoreRule }}
        </n-collapse-item>
      </n-collapse>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getShiftDashboard, type ShiftDashboardResult } from '@/api/performance';

const loading = ref(false);
const dashboard = ref<ShiftDashboardResult | null>(null);

async function load() {
  loading.value = true;
  try {
    dashboard.value = await getShiftDashboard();
  } finally {
    loading.value = false;
  }
}

function money(value?: number) {
  return Number(value || 0).toLocaleString('zh-CN', {
    maximumFractionDigits: 0
  });
}

function percent(value?: number) {
  return `${Number(value || 0).toFixed(2)}%`;
}

onMounted(load);
</script>
