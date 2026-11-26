import '@unocss/reset/tailwind.css';
import 'virtual:uno.css';
import './styles/global.css';

import { createApp } from 'vue';
import { MotionPlugin } from '@vueuse/motion';
import {
  create,
  NAlert,
  NButton,
  NButtonGroup,
  NCard,
  NCheckbox,
  NCheckboxGroup,
  NCollapse,
  NCollapseItem,
  NConfigProvider,
  NDialogProvider,
  NDivider,
  NEmpty,
  NForm,
  NFormItem,
  NFormItemGi,
  NGrid,
  NGridItem,
  NH2,
  NInput,
  NLayout,
  NLayoutContent,
  NLayoutHeader,
  NLayoutSider,
  NList,
  NListItem,
  NMessageProvider,
  NModal,
  NPagination,
  NPopconfirm,
  NProgress,
  NRadioButton,
  NRadioGroup,
  NSpace,
  NSpin,
  NStatistic,
  NSwitch,
  NTag,
} from 'naive-ui';
import App from './App.vue';
import { router } from './router';
import { pinia } from './stores';

const naive = create({
  components: [
    NAlert,
    NButton,
    NButtonGroup,
    NCard,
    NCheckbox,
    NCheckboxGroup,
    NCollapse,
    NCollapseItem,
    NConfigProvider,
    NDialogProvider,
    NDivider,
    NEmpty,
    NForm,
    NFormItem,
    NFormItemGi,
    NGrid,
    NGridItem,
    NH2,
    NInput,
    NLayout,
    NLayoutContent,
    NLayoutHeader,
    NLayoutSider,
    NList,
    NListItem,
    NMessageProvider,
    NModal,
    NPagination,
    NPopconfirm,
    NProgress,
    NRadioButton,
    NRadioGroup,
    NSpace,
    NSpin,
    NStatistic,
    NSwitch,
    NTag,
  ]
});

createApp(App).use(naive).use(MotionPlugin).use(pinia).use(router).mount('#app');
