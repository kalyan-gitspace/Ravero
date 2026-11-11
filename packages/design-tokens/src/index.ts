export const colors = {
  white: '#FFFFFF',
  black: '#000000',
  textPrimary: '#000000',
  textSecondary: '#666666',
  greyLight: '#F5F5F5',
  border: '#E5E5E5',
} as const;

export const typography = {
  fontFamily: 'Inter, Arial, sans-serif',
  fontFamilyMono: 'ui-monospace, SFMono-Regular, Consolas, monospace',
} as const;

export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  pill: 9999,
} as const;

export const components = {
  buttonHeight: 48,
  controlBorderWidth: 1,
} as const;
