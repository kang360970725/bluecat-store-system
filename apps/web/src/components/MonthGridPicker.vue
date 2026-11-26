<template>
  <div class="bc-month-picker">
    <div class="bc-month-year-nav">
      <n-button secondary aria-label="上一年" @click="year--">‹</n-button>
      <strong>{{ year }} 年</strong>
      <n-button
        secondary
        aria-label="下一年"
        :disabled="nextYearDisabled"
        @click="year++"
        >›</n-button
      >
    </div>
    <div class="bc-month-grid">
      <n-button
        v-for="month in 12"
        :key="month"
        :type="modelValue === monthValue(month) ? 'primary' : 'default'"
        :secondary="modelValue !== monthValue(month)"
        :disabled="isDisabled(monthValue(month))"
        class="bc-month-option"
        @click="$emit('update:modelValue', monthValue(month))"
      >
        <span>{{ month }} 月</span>
        <small v-if="disabledMonths.includes(monthValue(month))"
          >已有数据</small
        >
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    disabledMonths?: string[];
    maxMonth?: string;
  }>(),
  {
    disabledMonths: () => []
  }
);
defineEmits<{ 'update:modelValue': [value: string] }>();
const year = ref(
  Number(props.modelValue?.slice(0, 4)) || new Date().getFullYear()
);
watch(
  () => props.modelValue,
  (value) => {
    const selectedYear = Number(value?.slice(0, 4));
    if (selectedYear) year.value = selectedYear;
  }
);
const monthValue = (month: number) =>
  `${year.value}-${String(month).padStart(2, '0')}`;
const isDisabled = (value: string) =>
  props.disabledMonths.includes(value) ||
  (!!props.maxMonth && value > props.maxMonth);
const nextYearDisabled = computed(
  () => !!props.maxMonth && year.value >= Number(props.maxMonth.slice(0, 4))
);
</script>

<style scoped>
.bc-month-year-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.bc-month-year-nav strong {
  font-size: 18px;
}
.bc-month-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.bc-month-option {
  height: 54px;
}
.bc-month-option :deep(.n-button__content) {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.bc-month-option small {
  font-size: 10px;
  font-weight: 400;
}
@media (max-width: 520px) {
  .bc-month-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
}
</style>
