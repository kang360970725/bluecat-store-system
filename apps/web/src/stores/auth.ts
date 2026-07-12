import {
  AUTH_REFRESH_TOKEN_STORAGE_KEY,
  AUTH_TOKEN_STORAGE_KEY,
  AUTH_USER_STORAGE_KEY,
  type CurrentUser,
  type LoginResult
} from '@bluecat/shared';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '');
  const refreshToken = ref(
    localStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY) || ''
  );
  const user = ref<CurrentUser | null>(
    JSON.parse(localStorage.getItem(AUTH_USER_STORAGE_KEY) || 'null') as
      | CurrentUser
      | null
  );

  const isAuthenticated = computed(() => Boolean(accessToken.value));

  function setSession(session: LoginResult) {
    accessToken.value = session.accessToken;
    refreshToken.value = session.refreshToken;
    user.value = session.user;
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, session.accessToken);
    localStorage.setItem(AUTH_REFRESH_TOKEN_STORAGE_KEY, session.refreshToken);
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(session.user));
  }

  function clearSession() {
    accessToken.value = '';
    refreshToken.value = '';
    user.value = null;
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(AUTH_REFRESH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
  }

  return {
    accessToken,
    refreshToken,
    user,
    isAuthenticated,
    setSession,
    clearSession
  };
});
