import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { IconButton } from '@/components/ui/icon-button';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii } from '@/theme/palette';
import type { PracticeTask } from '@/types/domain';

type TaskCardProps = {
  task: PracticeTask;
  completed: boolean;
  onToggleCompleted: (id: string) => void;
};

function TaskCardComponent({ task, completed, onToggleCompleted }: TaskCardProps) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const open = useCallback(() => {
    router.push({ pathname: '/task/[id]', params: { id: task.id } });
  }, [router, task.id]);
  const toggleCompleted = useCallback(
    () => onToggleCompleted(task.id),
    [onToggleCompleted, task.id],
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.topRow}>
        <View style={styles.chips}>
          <Chip label={task.specialty} />
          <AppText variant="caption" color="muted">
            {task.difficulty}
          </AppText>
        </View>
        <IconButton
          icon="checkmark-circle-outline"
          activeIcon="checkmark-circle"
          active={completed}
          label={completed ? 'Вернуть задачу в работу' : 'Отметить задачу выполненной'}
          onPress={toggleCompleted}
        />
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Открыть задачу: ${task.title}`}
        android_ripple={{ color: colors.overlay }}
        onPress={open}
        style={({ pressed }) => [styles.content, pressed && styles.pressed]}>
        <AppText variant="subtitle" style={completed ? styles.completed : undefined}>
          {task.title}
        </AppText>
        <AppText color="secondary" numberOfLines={2}>
          {task.description}
        </AppText>
        <View style={styles.footer}>
          <View style={styles.time}>
            <Ionicons name="time-outline" size={17} color={colors.textMuted} />
            <AppText variant="caption" color="muted">
              {task.estimatedMinutes} мин
            </AppText>
          </View>
          <Ionicons name="arrow-forward" size={20} color={colors.accent} />
        </View>
      </Pressable>
    </View>
  );
}

export const TaskCard = memo(TaskCardComponent);

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radii.lg, overflow: 'hidden' },
  topRow: {
    minHeight: 56,
    paddingLeft: 16,
    paddingRight: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  content: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 18, gap: 10 },
  footer: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  completed: { textDecorationLine: 'line-through', opacity: 0.7 },
  pressed: { opacity: 0.72 },
});
