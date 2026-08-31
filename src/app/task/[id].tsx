import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { DetailLayout, MissingDetail } from '@/components/detail-layout';
import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { PrimaryButton } from '@/components/ui/primary-button';
import { practiceTasks } from '@/data/mock-data';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useLearningDetail } from '@/hooks/use-learning-detail';
import { useAppStore } from '@/store/use-app-store';
import { radii } from '@/theme/palette';

export function generateStaticParams() {
  return practiceTasks.map(({ id }) => ({ id }));
}

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const [showSolution, setShowSolution] = useState(false);
  const { item: task, loading } = useLearningDetail('task', id);
  const completedTaskIds = useAppStore((state) => state.completedTaskIds);
  const toggleTaskCompleted = useAppStore((state) => state.toggleTaskCompleted);
  const toggleCompleted = useCallback(() => {
    if (!task) return;
    toggleTaskCompleted(task.id);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [task, toggleTaskCompleted]);
  const toggleSolution = useCallback(() => setShowSolution((value) => !value), []);

  if (loading) return <DetailLayout><ActivityIndicator color={colors.accent} /></DetailLayout>;
  if (!task) return <MissingDetail title="Задача не найдена" />;
  const completed = completedTaskIds.includes(task.id);

  return (
    <DetailLayout>
      <View style={styles.meta}>
        <Chip label={task.specialty} />
        <Chip label={task.difficulty} />
        <Chip label={`${task.estimatedMinutes} мин`} />
      </View>
      <AppText variant="display">{task.title}</AppText>
      <AppText color="secondary">{task.description}</AppText>
      <View style={styles.section}>
        <AppText variant="subtitle">Что проверяем</AppText>
        <View style={styles.meta}>
          {task.skills.map((skill) => (
            <Chip key={skill} label={skill} />
          ))}
        </View>
      </View>
      {task.starterCode ? (
        <View style={[styles.code, { backgroundColor: colors.surfaceRaised }]}>
          <View style={styles.codeHeader}>
            <AppText variant="caption" color="muted">
              STARTER.TS
            </AppText>
            <Ionicons name="code-slash" size={18} color={colors.textMuted} />
          </View>
          <AppText variant="code" style={{ color: colors.code }} selectable>
            {task.starterCode}
          </AppText>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showSolution }}
        accessibilityLabel={showSolution ? 'Скрыть разбор задачи' : 'Показать разбор задачи'}
        android_ripple={{ color: colors.overlay }}
        onPress={toggleSolution}
        style={({ pressed }) => [
          styles.solutionToggle,
          { borderColor: colors.border, backgroundColor: colors.surface },
          pressed && styles.pressed,
        ]}>
        <View style={{ flex: 1 }}>
          <AppText variant="label">Разбор решения</AppText>
          <AppText variant="caption" color="muted">
            Сначала попробуйте решить самостоятельно
          </AppText>
        </View>
        <Ionicons
          name={showSolution ? 'chevron-up' : 'chevron-down'}
          size={22}
          color={colors.accent}
        />
      </Pressable>
      {showSolution ? (
        <View style={[styles.solution, { backgroundColor: colors.warmSoft }]}>
          <AppText variant="subtitle">Подход</AppText>
          <AppText color="secondary">{task.solution}</AppText>
        </View>
      ) : null}
      <PrimaryButton
        label={completed ? 'Вернуть в работу' : 'Отметить выполненной'}
        icon={completed ? 'refresh' : 'checkmark-circle'}
        onPress={toggleCompleted}
        secondary={completed}
      />
    </DetailLayout>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  section: { gap: 10 },
  code: { padding: 16, borderRadius: radii.md, gap: 12 },
  codeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  solutionToggle: {
    minHeight: 70,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  solution: { padding: 18, borderRadius: radii.lg, gap: 10 },
  pressed: { opacity: 0.72 },
});
