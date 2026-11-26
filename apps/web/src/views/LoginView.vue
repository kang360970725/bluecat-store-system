<template>
  <main class="login-page">
    <div class="login-grid">
      <section class="login-visual" aria-hidden="true">
        <div class="brand-mark">BC</div>
        <div class="visual-copy">
          <p>Store Intelligence</p>
          <h1>蓝猫电竞·门店运营系统</h1>
          <span>门店、权限、会员与任务计划的一体化运营中枢</span>
        </div>
        <div class="signal-board">
          <div v-for="item in signalItems" :key="item.label" class="signal-row">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </div>
        </div>
      </section>

      <section class="login-panel">
        <div class="panel-heading">
          <span class="eyebrow">Secure Access</span>
          <h2>欢迎回来</h2>
          <p>使用系统账号进入门店运营后台</p>
        </div>

        <n-form class="login-form" :model="form" @submit.prevent="submit">
          <n-form-item label="账号">
            <n-input
              v-model:value="form.username"
              placeholder="请输入账号"
              size="large"
              clearable
            />
          </n-form-item>
          <n-form-item label="密码">
            <n-input
              v-model:value="form.password"
              placeholder="请输入密码"
              type="password"
              size="large"
              show-password-on="click"
            />
          </n-form-item>
          <n-button
            class="login-submit"
            attr-type="submit"
            type="primary"
            size="large"
            block
            :loading="loading"
          >
            登录
          </n-button>
        </n-form>

        <div class="login-footer">
          <div class="footer-status">
            <span></span>
            <strong>安全连接已就绪</strong>
          </div>
          <p>BlueCat Esports Operation Console</p>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useMessage } from 'naive-ui';
import { useRoute, useRouter } from 'vue-router';
import { login } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const route = useRoute();
const message = useMessage();
const auth = useAuthStore();
const loading = ref(false);
const form = reactive({
  username: '',
  password: ''
});

const signalItems = [
  { label: 'Auth', value: 'JWT' },
  { label: 'Data', value: 'MySQL' },
  { label: 'Cache', value: 'Redis' }
];

async function submit() {
  loading.value = true;
  try {
    const session = await login(form);
    auth.setSession(session);
    router.push(
      session.user.mustChangePassword
        ? '/change-password'
        : typeof route.query.redirect === 'string'
          ? route.query.redirect
          : '/'
    );
  } catch (error) {
    message.error(error instanceof Error ? error.message : '登录失败');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 28px;
  overflow: hidden;
  background:
    radial-gradient(
      circle at 16% 18%,
      rgba(38, 166, 154, 0.18),
      transparent 28%
    ),
    radial-gradient(
      circle at 82% 14%,
      rgba(22, 119, 255, 0.16),
      transparent 30%
    ),
    linear-gradient(135deg, #eef6ff 0%, #f7fafc 46%, #f1fbf8 100%);
}

.login-page::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(15, 23, 42, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(15, 23, 42, 0.05) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.85), transparent);
}

.login-grid {
  position: relative;
  z-index: 1;
  width: min(1040px, 100%);
  min-height: 620px;
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(360px, 0.92fr);
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.74);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(18px);
}

.login-visual {
  position: relative;
  min-height: 620px;
  padding: 42px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: #f8fafc;
  background:
    linear-gradient(145deg, rgba(15, 23, 42, 0.92), rgba(17, 94, 89, 0.84)),
    #0f172a;
}

.login-visual::before,
.login-visual::after {
  content: '';
  position: absolute;
  inset: 34px;
  border: 1px solid rgba(125, 211, 252, 0.18);
  border-radius: 8px;
}

.login-visual::after {
  inset: auto 42px 152px auto;
  width: 180px;
  height: 180px;
  border-color: rgba(45, 212, 191, 0.28);
  transform: rotate(18deg);
}

.brand-mark {
  position: relative;
  z-index: 1;
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  font-weight: 800;
  letter-spacing: 0;
}

.visual-copy {
  position: relative;
  z-index: 1;
  max-width: 430px;
}

.visual-copy p,
.eyebrow {
  margin: 0 0 14px;
  color: #5eead4;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.visual-copy h1 {
  margin: 0;
  font-size: 42px;
  line-height: 1.08;
  letter-spacing: 0;
}

.visual-copy span {
  display: block;
  margin-top: 18px;
  color: rgba(226, 232, 240, 0.82);
  font-size: 15px;
  line-height: 1.8;
}

.signal-board {
  position: relative;
  z-index: 1;
  width: min(360px, 100%);
  display: grid;
  gap: 10px;
}

.signal-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.34);
}

.signal-row span {
  color: rgba(226, 232, 240, 0.72);
  font-size: 13px;
}

.signal-row strong {
  color: #ccfbf1;
  font-size: 13px;
}

.login-panel {
  padding: 72px 56px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  background:
    linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.94),
      rgba(248, 250, 252, 0.92)
    ),
    #fff;
}

.panel-heading {
  margin-bottom: 30px;
}

.panel-heading h2 {
  margin: 0;
  color: #111827;
  font-size: 30px;
  line-height: 1.2;
}

.panel-heading p {
  margin: 10px 0 0;
  color: #64748b;
  font-size: 14px;
}

.login-form {
  width: 100%;
}

.login-submit {
  height: 44px;
  font-weight: 700;
}

.login-meta {
  margin-top: 18px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: #64748b;
  font-size: 12px;
}

.login-footer {
  margin-top: 38px;
  padding-top: 18px;
  border-top: 1px solid rgba(148, 163, 184, 0.18);
  color: #94a3b8;
}

.footer-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #334155;
  font-size: 12px;
}

.footer-status span {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #10b981;
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.12);
}

.footer-status strong {
  font-weight: 700;
}

.login-footer p {
  margin: 8px 0 0;
  font-size: 11px;
}

@media (max-width: 860px) {
  .login-page {
    min-height: 100svh;
    padding: 14px;
    align-items: start;
    overflow-y: auto;
  }

  .login-grid {
    min-height: auto;
    grid-template-columns: 1fr;
  }

  .login-visual {
    min-height: 132px;
    padding: 18px 20px;
    justify-content: center;
  }

  .login-visual::before,
  .login-visual::after,
  .brand-mark,
  .visual-copy p {
    display: none;
  }

  .visual-copy h1 {
    font-size: 25px;
    line-height: 1.18;
  }

  .visual-copy span,
  .signal-board {
    display: none;
  }

  .login-panel {
    min-height: calc(100svh - 160px);
    padding: 24px 22px 20px;
    justify-content: flex-start;
  }

  .panel-heading {
    margin-bottom: 18px;
  }

  .panel-heading h2 {
    font-size: 24px;
  }

  .login-form :deep(.n-form-item) {
    margin-bottom: 14px;
  }

  .login-meta {
    margin-top: 14px;
  }

  .login-footer {
    margin-top: auto;
    padding-top: 20px;
  }
}

@media (max-width: 420px) {
  .login-page {
    padding: 0;
    background: #f7fafc;
  }

  .login-grid {
    min-height: 100svh;
    border: 0;
    border-radius: 0;
  }

  .login-visual {
    min-height: 104px;
    padding: 16px 20px;
  }

  .visual-copy h1 {
    font-size: 22px;
  }

  .login-panel {
    min-height: calc(100svh - 104px);
    padding: 22px 18px 18px;
  }

  .panel-heading {
    margin-bottom: 16px;
  }

  .panel-heading h2 {
    font-size: 22px;
  }

  .panel-heading p {
    margin-top: 6px;
    font-size: 13px;
  }

  .login-meta {
    flex-direction: column;
    gap: 6px;
  }

  .login-footer {
    padding-bottom: max(0px, env(safe-area-inset-bottom));
  }
}
</style>
