import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii } from '@/theme/palette';

type IconName = ComponentProps<typeof Ionicons>['name'];

type PrimaryButtonProps = {
  label: string;
  icon?: IconName;
  onPress: () => void;
  secondary?: boolean;
  loading?: boolean;
  disabled?: boolean;
};

export function PrimaryButton({ label, icon, onPress, secondary = false, loading = false, disabled = false }: PrimaryButtonProps) {
  const { colors } = useAppTheme();
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      android_ripple={{ color: colors.overlay }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: secondary ? colors.accentSoft : colors.accent,
          borderColor: secondary ? colors.accent : colors.accent,
        },
        pressed && styles.pressed,
        inactive && styles.disabled,
      ]}>
      {loading ? <ActivityIndicator size="small" color={secondary ? colors.accentText : '#FFFFFF'} /> : icon ? (
        <Ionicons name={icon} size={20} color={secondary ? colors.accentText : '#FFFFFF'} />
      ) : null}
      <AppText
        variant="label"
        style={{ color: secondary ? colors.accentText : '#FFFFFF' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    paddingHorizontal: 18,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.58 },
});
