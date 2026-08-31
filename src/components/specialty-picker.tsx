import { useCallback } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { Chip } from '@/components/ui/chip';
import type { Specialty } from '@/types/domain';

const specialties: Specialty[] = ['Frontend', 'Backend', 'Mobile', 'QA'];

export function SpecialtyPicker({
  value,
  onChange,
  includeAll = false,
}: {
  value: Specialty | 'Все';
  onChange: (value: Specialty | 'Все') => void;
  includeAll?: boolean;
}) {
  const data: (Specialty | 'Все')[] = includeAll ? ['Все', ...specialties] : specialties;
  const renderItem = useCallback(
    ({ item }: { item: Specialty | 'Все' }) => (
      <Chip label={item} selected={item === value} onPress={() => onChange(item)} />
    ),
    [onChange, value],
  );
  const keyExtractor = useCallback((item: Specialty | 'Все') => item, []);

  return (
    <FlatList
      horizontal
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 14, gap: 8 },
});
