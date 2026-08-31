import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { useAppTheme } from '@/hooks/use-app-theme';

export function DetailLayout({ children }: PropsWithChildren) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}

export function MissingDetail({ title }: { title: string }) {
  return (
    <DetailLayout>
      <View style={styles.missing}>
        <AppText variant="title">{title}</AppText>
        <AppText color="secondary">Возможно, материал был обновлён или удалён.</AppText>
      </View>
    </DetailLayout>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 18 },
  missing: { paddingVertical: 32, gap: 8 },
});
