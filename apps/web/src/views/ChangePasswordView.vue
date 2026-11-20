<template>
  <main class="password-page">
    <n-card title="首次登录，请修改密码" class="password-card">
      <n-alert type="warning" :bordered="false"
        >当前使用的是系统初始密码。设置新密码后才能进入系统。</n-alert
      >
      <n-form label-placement="top" class="password-form">
        <n-form-item label="当前密码"
          ><n-input
            v-model:value="form.currentPassword"
            type="password"
            show-password-on="click"
        /></n-form-item>
        <n-form-item label="新密码"
          ><n-input
            v-model:value="form.newPassword"
            type="password"
            show-password-on="click"
            placeholder="至少 8 位"
        /></n-form-item>
        <n-form-item label="确认新密码"
          ><n-input
            v-model:value="confirmPassword"
            type="password"
            show-password-on="click"
        /></n-form-item>
        <n-button type="primary" block :loading="saving" @click="save"
          >修改密码并进入系统</n-button
        >
      </n-form>
    </n-card>
  </main>
</template>
<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { changePassword } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
const router = useRouter(),
  message = useMessage(),
  auth = useAuthStore(),
  saving = ref(false),
  confirmPassword = ref('');
const form = reactive({ currentPassword: '', newPassword: '' });
async function save() {
  if (form.newPassword.length < 8) return message.warning('新密码至少 8 位');
  if (form.newPassword !== confirmPassword.value)
    return message.warning('两次输入的新密码不一致');
  saving.value = true;
  try {
    const session = await changePassword(form);
    auth.setSession(session);
    message.success('密码修改成功');
    await router.replace('/');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '修改密码失败');
  } finally {
    saving.value = false;
  }
}
</script>
<style scoped>
.password-page {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 20px;
  background: #f1f5f9;
}
.password-card {
  width: min(460px, 100%);
}
.password-form {
  margin-top: 18px;
}
</style>
