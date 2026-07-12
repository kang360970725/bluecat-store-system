<template>
  <div class="dashboard">
    <n-grid :cols="4" :x-gap="16" :y-gap="16" responsive="screen">
      <n-grid-item v-for="item in metrics" :key="item.label">
        <n-card :bordered="false">
          <div class="metric-label">{{ item.label }}</div>
          <div class="metric-value">{{ item.value }}</div>
        </n-card>
      </n-grid-item>
    </n-grid>

    <n-card :bordered="false" class="mt-4">
      <n-space vertical>
        <n-h2>首批模块</n-h2>
        <n-tag v-for="module in modules" :key="module" type="info">
          {{ module }}
        </n-tag>
      </n-space>
    </n-card>
  </div>
</template>

<script setup lang="ts">
const metrics = [
  { label: '今日订单', value: '0' },
  { label: '新增会员', value: '0' },
  { label: '营业门店', value: '0' },
  { label: '待办任务', value: '0' }
];

const modules = ['登录鉴权', '权限系统', '组织门店', '会员档案', '商品套餐', '月度任务'];
</script>
