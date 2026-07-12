import '@unocss/reset/tailwind.css';
import 'virtual:uno.css';
import './styles/global.css';

import { createApp } from 'vue';
import naive from 'naive-ui';
import App from './App.vue';
import { router } from './router';
import { pinia } from './stores';

createApp(App).use(naive).use(pinia).use(router).mount('#app');
