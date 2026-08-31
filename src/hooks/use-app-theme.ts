import { useColorScheme } from 'react-native';

import { palette } from '@/theme/palette';

export function useAppTheme() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { colors: palette[scheme], scheme };
}
