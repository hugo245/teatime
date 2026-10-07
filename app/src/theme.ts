export const colors = {
  bg: '#F7F3EE',
  surface: '#FFFFFF',
  surfaceMuted: '#F1ECE4',
  text: '#1D2621',
  textMuted: '#55605A',
  textFaint: '#7D8681',
  border: '#E6DFD4',
  primary: '#2E6B4E',
  primaryPressed: '#24563E',
  primarySoft: '#E2EEE6',
  accent: '#D98A1F',
  accentSoft: '#FCEFD8',
  danger: '#C8423A',
  dangerPressed: '#A9362F',
  dangerSoft: '#FBE6E3',
  online: '#2FA36B',
  callBg: '#111814',
  scrim: 'rgba(17, 24, 20, 0.55)',
  white: '#FFFFFF',
};

export const fonts = {
  regular: 'Nunito_400Regular',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  heavy: 'Nunito_800ExtraBold',
};

export const type = {
  display: { fontFamily: fonts.heavy, fontSize: 34, lineHeight: 41 },
  title: { fontFamily: fonts.heavy, fontSize: 27, lineHeight: 34 },
  heading: { fontFamily: fonts.bold, fontSize: 21, lineHeight: 27 },
  body: { fontFamily: fonts.regular, fontSize: 19, lineHeight: 27 },
  bodyStrong: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 27 },
  label: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22 },
  caption: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 21 },
} as const;

export type TypeVariant = keyof typeof type;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  page: 20,
};

export const radius = {
  sm: 12,
  md: 18,
  lg: 24,
  pill: 999,
};

export const shadow = {
  card: {
    shadowColor: '#3B2F1E',
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#1D2621',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
};

const avatarPalette = ['#E7D3B5', '#CFE3D4', '#F3D2C4', '#D5DCEF', '#EBD9E8', '#DCE7C1', '#F2E1B3', '#CDE4E6'];

export function avatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return avatarPalette[Math.abs(hash) % avatarPalette.length]!;
}
