export const palette = {
  light: {
    background: '#F5F7F3',
    surface: '#FFFFFF',
    surfaceRaised: '#EAF0E9',
    text: '#172019',
    textSecondary: '#55635A',
    textMuted: '#6F7C73',
    accent: '#146B4B',
    accentPressed: '#0E533A',
    accentSoft: '#DCEEE5',
    accentText: '#0A4D35',
    warm: '#C45828',
    warmSoft: '#F6E4DA',
    warning: '#A54B1B',
    success: '#25754D',
    border: '#D9E0DA',
    overlay: 'rgba(23, 32, 25, 0.08)',
    code: '#243E34',
  },
  dark: {
    background: '#0C100E',
    surface: '#151B17',
    surfaceRaised: '#202A23',
    text: '#E8EEE9',
    textSecondary: '#B2BDB5',
    textMuted: '#8F9B92',
    accent: '#72D5A6',
    accentPressed: '#90E1BA',
    accentSoft: '#173D2D',
    accentText: '#B6F2D1',
    warm: '#F19A6B',
    warmSoft: '#48291C',
    warning: '#F2A06F',
    success: '#82D6AA',
    border: '#2B362E',
    overlay: 'rgba(255, 255, 255, 0.08)',
    code: '#C7E7D5',
  },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radii = { sm: 10, md: 16, lg: 24, pill: 999 } as const;
export type AppPalette = (typeof palette)['light'];
