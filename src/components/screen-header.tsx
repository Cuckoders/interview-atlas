import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';

type ScreenHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
};

export function ScreenHeader({ eyebrow, title, subtitle }: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      {eyebrow ? (
        <AppText variant="label" color="accent">
          {eyebrow.toUpperCase()}
        </AppText>
      ) : null}
      <AppText variant="display">{title}</AppText>
      {subtitle ? <AppText color="secondary">{subtitle}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, gap: 6 },
});
