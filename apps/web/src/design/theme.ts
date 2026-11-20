import type { GlobalThemeOverrides } from 'naive-ui';

export const blueCatTheme: GlobalThemeOverrides = {
  common: {
    primaryColor: '#2563eb',
    primaryColorHover: '#3b82f6',
    primaryColorPressed: '#1d4ed8',
    primaryColorSuppl: '#60a5fa',
    infoColor: '#2563eb',
    successColor: '#10b981',
    warningColor: '#f59e0b',
    errorColor: '#ef4444',
    borderRadius: '10px',
    borderRadiusSmall: '8px',
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    bodyColor: '#f4f7fb',
    cardColor: 'rgba(255, 255, 255, 0.94)',
    modalColor: '#ffffff',
    popoverColor: '#ffffff',
    textColorBase: '#0f172a',
    textColor2: '#334155',
    textColor3: '#64748b',
    borderColor: '#e2e8f0',
    dividerColor: '#e8edf4'
  },
  Button: {
    heightMedium: '40px',
    heightLarge: '46px',
    borderRadiusMedium: '10px',
    fontWeight: '600'
  },
  Card: {
    borderRadius: '16px',
    paddingMedium: '20px'
  },
  DataTable: {
    borderRadius: '14px',
    thColor: '#f8fafc',
    thTextColor: '#475569',
    tdColorHover: '#f8fbff'
  },
  Input: { heightMedium: '40px', borderRadius: '10px' },
  Select: { peers: { InternalSelection: { heightMedium: '40px', borderRadius: '10px' } } },
  Modal: { borderRadius: '18px' },
  Drawer: { color: '#ffffff' },
  Menu: {
    borderRadius: '10px',
    itemHeight: '42px',
    itemColorActive: '#eff6ff',
    itemColorActiveHover: '#dbeafe',
    itemTextColorActive: '#1d4ed8',
    itemTextColorActiveHover: '#1d4ed8',
    arrowColorActive: '#2563eb'
  }
};
