import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetUno
} from 'unocss';

export default defineConfig({
  presets: [presetUno(), presetAttributify(), presetIcons()],
  theme: {
    colors: {
      brand: {
        50: '#edf7ff',
        500: '#1677ff',
        600: '#0958d9'
      }
    }
  }
});
