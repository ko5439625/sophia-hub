// Sophia Hub Design Tokens — Apple-inspired Design System

export const colors = {
  // Backgrounds
  bg: {
    primary: 'rgba(28, 28, 30, 0.85)',
    card: 'rgba(255, 255, 255, 0.05)',
    cardHover: 'rgba(255, 255, 255, 0.08)',
    elevated: 'rgba(255, 255, 255, 0.03)',
    input: 'rgba(255, 255, 255, 0.06)',
  },

  // Text
  text: {
    primary: '#f5f5f7',
    secondary: '#a1a1a6',
    tertiary: '#6e6e73',
    inverse: '#1c1c1e',
  },

  // Accent — iOS Blue
  accent: {
    primary: '#007AFF',
    primaryHover: '#0A84FF',
    primaryMuted: 'rgba(0, 122, 255, 0.15)',
    primarySubtle: 'rgba(0, 122, 255, 0.08)',
  },

  // Semantic
  status: {
    success: '#30D158',
    successMuted: 'rgba(48, 209, 88, 0.15)',
    warning: '#FFD60A',
    warningMuted: 'rgba(255, 214, 10, 0.15)',
    error: '#FF453A',
    errorMuted: 'rgba(255, 69, 58, 0.15)',
    info: '#64D2FF',
    infoMuted: 'rgba(100, 210, 255, 0.15)',
  },

  // Borders & Separators
  border: {
    primary: 'rgba(255, 255, 255, 0.08)',
    subtle: 'rgba(255, 255, 255, 0.04)',
    accent: 'rgba(0, 122, 255, 0.3)',
  },

  // Scrollbar
  scrollbar: {
    thumb: 'rgba(255, 255, 255, 0.12)',
    thumbHover: 'rgba(255, 255, 255, 0.2)',
  },
} as const

export const typography = {
  title: { fontSize: 15, fontWeight: 600 as const, lineHeight: 1.3 },
  subtitle: { fontSize: 13, fontWeight: 600 as const, lineHeight: 1.4 },
  body: { fontSize: 13, fontWeight: 400 as const, lineHeight: 1.5 },
  caption: { fontSize: 11, fontWeight: 400 as const, lineHeight: 1.4 },
  overline: {
    fontSize: 10,
    fontWeight: 600 as const,
    lineHeight: 1.2,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  full: 9999,
} as const

export const transition = {
  fast: 'all 150ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  normal: 'all 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  slow: 'all 400ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  curve: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
} as const

export const shadow = {
  sm: '0 1px 3px rgba(0, 0, 0, 0.3)',
  md: '0 4px 12px rgba(0, 0, 0, 0.25)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.3)',
} as const
