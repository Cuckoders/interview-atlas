import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';

export function SectionTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.row}>
      <AppText variant="subtitle">{title}</AppText>
      {detail ? (
        <AppText variant="caption" color="muted">
          {detail}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
