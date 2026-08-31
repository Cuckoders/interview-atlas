import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, type TextProps } from 'react-native';

import { useAppTheme } from '@/hooks/use-app-theme';

type TextVariant = 'display' | 'title' | 'subtitle' | 'body' | 'label' | 'caption' | 'code';

type AppTextProps = PropsWithChildren<
  TextProps & {
    variant?: TextVariant;
    color?: 'primary' | 'secondary' | 'muted' | 'accent';
  }
>;

export function AppText({
  children,
  variant = 'body',
  color = 'primary',
  style,
  ...props
}: AppTextProps) {
  const { colors } = useAppTheme();
  const resolvedColor = {
    primary: colors.text,
    secondary: colors.textSecondary,
    muted: colors.textMuted,
    accent: colors.accent,
  }[color];

  return (
    <Text {...props} style={[styles[variant], { color: resolvedColor }, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.7 },
  title: { fontSize: 24, lineHeight: 31, fontWeight: '700', letterSpacing: -0.35 },
  subtitle: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  code: { fontSize: 14, lineHeight: 22, fontFamily: 'monospace' },
});
