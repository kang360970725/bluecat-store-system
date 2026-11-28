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
const testPath = settingsPath + '/employee-test-access';
interface EmployeeTestSettings {
  enabled: boolean;
  operator: string;
  targets: string[];
}
const testEnabled = ref(false);
const testOperator = ref('');
const testTargets = ref('');
const testSettingsSaved = ref(false);

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

function applyTestSettings(value: EmployeeTestSettings) {
  testEnabled.value = value.enabled;
  testOperator.value = value.operator;
  testTargets.value = value.targets.join('\n');
}

function saveTestSettings() {
  void run(async () => {
    testSettingsSaved.value = false;
    const value = await request<EmployeeTestSettings>(testPath, {
      method: 'PATCH',
      body: JSON.stringify({
        enabled: testEnabled.value,
        operator: testOperator.value.trim(),
        targets: testTargets.value.split(/\r?\n/).map((target) => target.trim()).filter(Boolean)
      })
    });
    applyTestSettings(value);
    testSettingsSaved.value = true;
  });
}

onMounted(() => void run(async () => {
  applySettings(await request<AttendanceSettings>(settingsPath));
  applyTestSettings(await request<EmployeeTestSettings>(testPath));
}));
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-xl font-semibold">小程序考勤配置</h1>
    <n-alert type="info" :bordered="false">
      门店 Wi-Fi BSSID
      由店长在对应门店工作台的「排班与考勤」中维护。
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
    <n-card v-if="settings" title="中海国际店测试账号" size="small">
      <p class="mb-4">仅指定的已绑定微信可切换名单中的测试账号。测试身份有效 30 分钟，关闭后立即失效。</p>
      <n-form>
        <n-form-item label="开启免密码测试">
          <n-switch v-model:value="testEnabled" :disabled="busy" @update:value="testSettingsSaved = false" />
        </n-form-item>
        <n-form-item label="测试操作员手机号">
          <n-input v-model:value="testOperator" maxlength="20" placeholder="填写已绑定微信的员工账号" :disabled="busy || !testEnabled" />
        </n-form-item>
        <n-form-item label="测试名单（每行一个手机号或员工编码，最多 20 个）">
          <n-input v-model:value="testTargets" type="textarea" :autosize="{ minRows: 3, maxRows: 8 }" :disabled="busy || !testEnabled" />
        </n-form-item>
        <n-space align="center">
          <n-button type="primary" :disabled="busy || (testEnabled && (!testOperator.trim() || !testTargets.trim()))" @click="saveTestSettings">
            保存测试设置
          </n-button>
          <span v-if="testSettingsSaved" role="status">已保存</span>
        </n-space>
      </n-form>
    </n-card>
    <n-alert v-if="errorMessage" type="error">{{ errorMessage }}</n-alert>
  </section>
</template>
