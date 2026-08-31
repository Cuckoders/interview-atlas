import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii } from '@/theme/palette';

type IconName = ComponentProps<typeof Ionicons>['name'];

type PrimaryButtonProps = {
  label: string;
  icon?: IconName;
  onPress: () => void;
  secondary?: boolean;
};

export function PrimaryButton({ label, icon, onPress, secondary = false }: PrimaryButtonProps) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors.overlay }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: secondary ? colors.accentSoft : colors.accent,
          borderColor: secondary ? colors.accent : colors.accent,
        },
        pressed && styles.pressed,
      ]}>
      {icon ? (
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
});
