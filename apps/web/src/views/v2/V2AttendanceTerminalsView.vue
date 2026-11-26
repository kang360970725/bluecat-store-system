<script setup lang="ts">
import { NInputNumber } from 'naive-ui';
import { onMounted, ref } from 'vue';
import { request } from '@/api/http';

interface AttendanceSettings {
  appId: string;
  hasAppSecret: boolean;
  clockInEarly: number | null;
  clockOutLate: number | null;
}

const settingsPath = '/v2/attendance/settings';
const settings = ref<AttendanceSettings>();
const appId = ref('');
const appSecret = ref('');
const clockInEarly = ref<number | null>(null);
const clockOutLate = ref<number | null>(null);
const secureConnection = window.isSecureContext;
const settingsSaved = ref(false);
const errorMessage = ref('');
const busy = ref(false);

function applySettings(value: AttendanceSettings) {
  settings.value = value;
  appId.value = value.appId;
  appSecret.value = '';
  clockInEarly.value = value.clockInEarly;
  clockOutLate.value = value.clockOutLate;
}

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

function saveSettings() {
  if (
    !secureConnection ||
    clockInEarly.value === null ||
    clockOutLate.value === null
  )
    return;
  void run(async () => {
    settingsSaved.value = false;
    const value = await request<AttendanceSettings>(settingsPath, {
      method: 'PATCH',
      body: JSON.stringify({
        appId: appId.value.trim(),
        ...(appSecret.value.trim()
          ? { appSecret: appSecret.value.trim() }
          : {}),
        clockInEarly: clockInEarly.value,
        clockOutLate: clockOutLate.value
      })
    });
    applySettings(value);
    settingsSaved.value = true;
  });
}

onMounted(
  () =>
    void run(async () =>
      applySettings(await request<AttendanceSettings>(settingsPath))
    )
);
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-xl font-semibold">小程序考勤配置</h1>
    <n-alert type="info" :bordered="false">
      门店 Wi-Fi BSSID
      由店长在对应门店工作台的「排班与考勤」中维护。本页只配置微信小程序和全局打卡时间窗口。
    </n-alert>
    <n-card v-if="settings" title="微信与打卡窗口" size="small">
      <n-alert v-if="!secureConnection" type="warning">
        请通过 HTTPS 打开此页面后保存微信 AppSecret。
      </n-alert>
      <n-form>
        <n-form-item label="微信小程序 AppID">
          <n-input v-model:value="appId" :disabled="busy" />
        </n-form-item>
        <n-form-item label="微信小程序 AppSecret">
          <n-input
            v-model:value="appSecret"
            type="password"
            :disabled="busy || !secureConnection"
            :placeholder="
              settings.hasAppSecret ? '已配置，留空保留原值' : '首次配置必填'
            "
          />
        </n-form-item>
        <n-form-item label="上班可提前打卡（分钟）">
          <n-input-number
            v-model:value="clockInEarly"
            :min="0"
            :max="999"
            :precision="0"
            :disabled="busy"
          />
        </n-form-item>
        <n-form-item label="下班可延后打卡（分钟）">
          <n-input-number
            v-model:value="clockOutLate"
            :min="0"
            :max="999"
            :precision="0"
            :disabled="busy"
          />
        </n-form-item>
        <n-space align="center">
          <n-button
            type="primary"
            :disabled="
              busy ||
              !secureConnection ||
              !appId.trim() ||
              clockInEarly === null ||
              clockOutLate === null
            "
            @click="saveSettings"
            >保存考勤配置</n-button
          >
          <span v-if="settingsSaved" role="status">已保存</span>
        </n-space>
      </n-form>
    </n-card>
    <n-alert v-if="errorMessage" type="error">{{ errorMessage }}</n-alert>
  </section>
</template>
