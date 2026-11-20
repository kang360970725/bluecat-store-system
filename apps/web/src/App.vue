<template>
  <n-config-provider :theme-overrides="blueCatTheme">
    <n-dialog-provider>
      <n-message-provider>
        <router-view />
      </n-message-provider>
    </n-dialog-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { blueCatTheme } from '@/design/theme';
</script>
