<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  getV2AttendanceWifiNetworks,
  saveV2AttendanceWifiNetworks
} from '@/api/v2-attendance';
import { useAuthStore } from '@/stores/auth';

const props = defineProps<{ storeId: string }>();
const auth = useAuthStore();
const busy = ref(false);
const error = ref('');
const saved = ref(false);
const rows = ref<Array<{ id?: string; bssid: string; label: string }>>([]);
const canEdit = computed(
  () =>
    auth.user?.roles.includes('super_admin') ||
    auth.user?.permissions.includes('schedule:update')
);
const bssidPattern = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;

function normalize(value: string) {
  return value.trim().replace(/-/g, ':').toLowerCase();
}

async function load() {
  if (!canEdit.value) return;
  busy.value = true;
  error.value = '';
  try {
    rows.value = (await getV2AttendanceWifiNetworks(props.storeId)).map(
      (item) => ({ ...item, label: item.label ?? '' })
    );
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Wi-Fi 配置加载失败';
  } finally {
    busy.value = false;
  }
}

function add() {
  rows.value.push({ bssid: '', label: '' });
}

function remove(index: number) {
  rows.value.splice(index, 1);
}

async function save() {
  const networks = rows.value.map((item) => ({
    bssid: normalize(item.bssid),
    label: item.label.trim() || undefined
  }));
  if (networks.some((item) => !bssidPattern.test(item.bssid))) {
    error.value = 'BSSID 格式应为 AA:BB:CC:DD:EE:FF';
    return;
  }
  if (new Set(networks.map((item) => item.bssid)).size !== networks.length) {
    error.value = '同一个 BSSID 不能重复配置';
    return;
  }
  busy.value = true;
  error.value = '';
  saved.value = false;
  try {
    rows.value = (
      await saveV2AttendanceWifiNetworks(props.storeId, networks)
    ).map((item) => ({ ...item, label: item.label ?? '' }));
    saved.value = true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Wi-Fi 配置保存失败';
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section v-if="canEdit" class="wifi-settings">
    <div class="wifi-head">
      <div>
        <h3>打卡 Wi-Fi</h3>
        <p>登记门店路由器或接入点的 BSSID（硬件 MAC），可配置多个。</p>
      </div>
      <n-button secondary :disabled="busy" @click="add">新增 BSSID</n-button>
    </div>
    <n-alert type="info" :bordered="false">
      员工必须连接下方任一
      Wi-Fi，且处于有效排班与打卡时间窗口内，才能完成正常班或加班打卡。
    </n-alert>
    <n-alert v-if="error" type="error" :bordered="false">{{ error }}</n-alert>
    <n-alert v-if="saved" type="success" :bordered="false">配置已保存</n-alert>
    <div v-if="rows.length" class="wifi-list">
      <div v-for="(row, index) in rows" :key="row.id ?? index" class="wifi-row">
        <n-input
          v-model:value="row.label"
          maxlength="100"
          placeholder="名称，如：前台 AP"
        />
        <n-input
          v-model:value="row.bssid"
          maxlength="17"
          placeholder="AA:BB:CC:DD:EE:FF"
          @blur="row.bssid = normalize(row.bssid)"
        />
        <n-button tertiary type="error" :disabled="busy" @click="remove(index)"
          >移除</n-button
        >
      </div>
    </div>
    <n-empty v-else description="尚未配置打卡 Wi-Fi" />
    <div class="wifi-actions">
      <n-button type="primary" :loading="busy" @click="save"
        >保存 Wi-Fi 配置</n-button
      >
    </div>
  </section>
</template>

<style scoped>
.wifi-settings {
  display: grid;
  gap: 16px;
  padding: 4px 0;
}
.wifi-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.wifi-head h3 {
  margin: 0 0 6px;
}
.wifi-head p {
  margin: 0;
  color: #718096;
}
.wifi-list {
  display: grid;
  gap: 10px;
}
.wifi-row {
  display: grid;
  grid-template-columns: minmax(160px, 0.7fr) minmax(240px, 1fr) auto;
  gap: 10px;
}
.wifi-actions {
  display: flex;
  justify-content: flex-end;
}
@media (max-width: 720px) {
  .wifi-row {
    grid-template-columns: 1fr;
  }
}
</style>
