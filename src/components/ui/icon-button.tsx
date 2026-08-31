import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useAppTheme } from '@/hooks/use-app-theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type IconButtonProps = {
  icon: IconName;
  activeIcon?: IconName;
  active?: boolean;
  label: string;
  onPress: () => void;
};

export function IconButton({ icon, activeIcon, active = false, label, onPress }: IconButtonProps) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      android_ripple={{ color: colors.overlay, borderless: true }}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Ionicons
        name={active && activeIcon ? activeIcon : icon}
        color={active ? colors.accent : colors.textSecondary}
        size={23}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.68 },
});
