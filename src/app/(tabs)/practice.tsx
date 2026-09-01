import * as Haptics from 'expo-haptics';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { TaskCard } from '@/components/cards/task-card';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SpecialtyPicker } from '@/components/specialty-picker';
import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { PrimaryButton } from '@/components/ui/primary-button';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useLearningFeed } from '@/hooks/use-learning-feed';
import { useAppStore } from '@/store/use-app-store';
import type { Difficulty, PracticeTask, Specialty } from '@/types/domain';

type DifficultyFilter = Difficulty | 'Все';

export default function PracticeScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const specialty = useAppStore((state) => state.specialty);
  const setSpecialty = useAppStore((state) => state.setSpecialty);
  const completedTaskIds = useAppStore((state) => state.completedTaskIds);
  const toggleTaskCompleted = useAppStore((state) => state.toggleTaskCompleted);
  const [difficulty, setDifficulty] = useState<DifficultyFilter>('Все');
  const taskFeed = useLearningFeed('task', specialty);

  const data = useMemo(
    () =>
      taskFeed.items.filter(
        (item) =>
          item.specialty === specialty && (difficulty === 'Все' || item.difficulty === difficulty),
      ),
    [difficulty, specialty, taskFeed.items],
  );

  const selectSpecialty = useCallback(
    (value: Specialty | 'Все') => {
      if (value !== 'Все') {
        setSpecialty(value);
        void Haptics.selectionAsync();
      }
    },
    [setSpecialty],
  );
  const selectDifficulty = useCallback((value: DifficultyFilter) => {
    setDifficulty(value);
    void Haptics.selectionAsync();
  }, []);
  const renderItem = useCallback(
    ({ item }: { item: PracticeTask }) => (
      <View style={styles.itemContainer}>
        <TaskCard
          task={item}
          completed={completedTaskIds.includes(item.id)}
          onToggleCompleted={toggleTaskCompleted}
        />
      </View>
    ),
    [completedTaskIds, toggleTaskCompleted],
  );
  const keyExtractor = useCallback((item: PracticeTask) => item.id, []);

  const header = (
    <>
      <ScreenHeader
        eyebrow="Тренажёр"
        title="Решать руками"
        subtitle="Алгоритмы, проектирование и практические кейсы из интервью."
      />
      <SpecialtyPicker value={specialty} onChange={selectSpecialty} />
      <View style={[styles.notice, { backgroundColor: taskFeed.stale || taskFeed.error ? colors.warmSoft : colors.accentSoft }]}>
        <AppText variant="caption" style={{ color: taskFeed.stale || taskFeed.error ? colors.warning : colors.success }}>
          {taskFeed.error ?? (taskFeed.stale ? 'Показаны локальные задачи.' : 'Задачи синхронизированы с CMS.')}
        </AppText>
      </View>
      <View style={styles.filters}>
        {(['Все', 'Начальный', 'Средний', 'Продвинутый'] as DifficultyFilter[]).map((item) => (
          <Chip
            key={item}
            label={item}
            selected={difficulty === item}
            onPress={() => selectDifficulty(item)}
          />
        ))}
      </View>
      <View style={styles.summary}>
        <AppText variant="label">{data.length} задач по выбранным фильтрам</AppText>
        <AppText variant="caption" color="muted">
          Выполнено всего: {completedTaskIds.length}
        </AppText>
      </View>
      <View style={styles.simulationAction}><PrimaryButton label="Симуляция интервью" icon="mic-outline" secondary onPress={() => router.push('/simulation' as Href)} /></View>
    </>
  );

  return (
    <Screen>
      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={header}
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={EmptyTasks}
        ListFooterComponent={taskFeed.loading ? <ActivityIndicator style={styles.loader} color={colors.accent} /> : null}
        refreshControl={<RefreshControl refreshing={taskFeed.refreshing} onRefresh={taskFeed.refresh} tintColor={colors.accent} colors={[colors.accent]} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={6}
        windowSize={5}
      />
    </Screen>
  );
}

function Separator() {
  return <View style={{ height: 6 * 2 }} />;
}

function EmptyTasks() {
  return (
    <View style={styles.empty}>
      <AppText variant="subtitle">Пока нет задач</AppText>
      <AppText color="secondary">Смените сложность или направление.</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 112 },
  itemContainer: { paddingHorizontal: 20 },
  filters: { paddingHorizontal: 20, paddingBottom: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  notice: { marginHorizontal: 20, marginBottom: 12, padding: 13, borderRadius: 16 },
  summary: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, gap: 2 },
  empty: { paddingHorizontal: 20, paddingVertical: 36, gap: 8 },
  loader: { paddingVertical: 24 },
  simulationAction: { paddingHorizontal: 20, paddingBottom: 18 },
});
