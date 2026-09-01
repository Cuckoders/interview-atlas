import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { DetailLayout, MissingDetail } from '@/components/detail-layout';
import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { PrimaryButton } from '@/components/ui/primary-button';
import { practiceTasks } from '@/data/mock-data';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useLearningDetail } from '@/hooks/use-learning-detail';
import { fetchTaskSubmissions, runTaskCode } from '@/services/learning-lab-api';
import { useAppStore } from '@/store/use-app-store';
import { useSessionStore } from '@/store/use-session-store';
import { radii } from '@/theme/palette';
import type { PracticeTask } from '@/types/domain';
import type { TaskSubmission } from '@/types/learning-lab';

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
  const runnerSessionKey = useSessionStore((state) => `${state.status}:${state.user?.id ?? 'none'}`);
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
      {task.runner ? <TaskRunner key={`${task.id}:${task.contentVersion}:${runnerSessionKey}`} task={task} runner={task.runner} /> : null}
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

function TaskRunner({ task, runner }: { task: PracticeTask; runner: NonNullable<PracticeTask['runner']> }) {
  const { colors } = useAppTheme();
  const sessionStatus = useSessionStore((state) => state.status);
  const userId = useSessionStore((state) => state.user?.id ?? null);
  const [code, setCode] = useState(() => task.starterCode ?? `function ${runner.entrypoint}() {\n  // ваше решение\n}`);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<TaskSubmission | null>(null);
  const [submissions, setSubmissions] = useState<TaskSubmission[]>([]);
  useEffect(() => {
    if (sessionStatus !== 'signedIn' || !userId) return;
    let cancelled = false;
    void fetchTaskSubmissions(task.id).then((items) => { if (!cancelled) setSubmissions(items); }).catch(() => {});
    return () => { cancelled = true; };
  }, [sessionStatus, task.id, userId]);
  const runCode = useCallback(async () => {
    setRunning(true); setRunError(null);
    try {
      const result = await runTaskCode(task.id, task.contentVersion, code);
      setRunResult(result); setSubmissions((current) => [result, ...current.filter((item) => item.id !== result.id)].slice(0, 20));
      void Haptics.notificationAsync(result.passedCount === result.totalCount ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
    } catch (caught) { setRunError(caught instanceof Error ? caught.message : 'Не удалось проверить решение'); }
    finally { setRunning(false); }
  }, [code, task.contentVersion, task.id]);
  return <View style={styles.runnerSection}>
    <View style={styles.section}><AppText variant="subtitle">Редактор решения</AppText><AppText variant="caption" color="muted">JavaScript · функция `{runner.entrypoint}` · скрытые тесты выполняются в изолированном контейнере</AppText></View>
    <TextInput value={code} onChangeText={setCode} multiline autoCapitalize="none" autoCorrect={false} accessibilityLabel="Код решения" textAlignVertical="top" placeholder="Введите решение" placeholderTextColor={colors.textMuted} style={[styles.editor, { color: colors.code, backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} />
    {sessionStatus !== 'signedIn' ? <View style={[styles.runNotice, { backgroundColor: colors.warmSoft }]}><AppText variant="caption" style={{ color: colors.warning }}>Войдите в аккаунт, чтобы запустить тесты и сохранить историю решений.</AppText></View> : null}
    {runError ? <View accessibilityRole="alert" style={[styles.runNotice, { backgroundColor: colors.warmSoft }]}><AppText variant="caption" style={{ color: colors.warning }}>{runError}</AppText></View> : null}
    {runResult ? <View style={[styles.runResult, { backgroundColor: runResult.passedCount === runResult.totalCount ? colors.accentSoft : colors.warmSoft }]}><AppText variant="subtitle">Пройдено {runResult.passedCount}/{runResult.totalCount} · {runResult.durationMs} мс</AppText>{runResult.tests.map((test) => <View key={test.name} style={styles.testRow}><Ionicons name={test.passed ? 'checkmark-circle' : 'close-circle'} size={20} color={test.passed ? colors.success : colors.warning} /><AppText variant="caption" style={{ flex: 1 }}>{test.name}{test.message ? ` · ${test.message}` : ''}</AppText></View>)}</View> : null}
    <PrimaryButton label="Запустить скрытые тесты" icon="play" loading={running} disabled={sessionStatus !== 'signedIn' || code.trim().length === 0} onPress={runCode} />
    {submissions.length ? <View style={styles.history}>
      <AppText variant="subtitle">История и сравнение</AppText>
      {submissions.map((item, index) => <Pressable
        key={item.id}
        accessibilityRole="button"
        accessibilityLabel={`Открыть решение ${index + 1}`}
        onPress={() => setCode(item.code)}
        style={[styles.historyItem, { borderColor: colors.border, backgroundColor: colors.surface }]}
      >
        <View>
          <AppText variant="label">{item.passedCount}/{item.totalCount} тестов</AppText>
          <AppText variant="caption" color="muted">{new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(item.createdAt))}</AppText>
        </View>
        <AppText variant="caption" color="accent">{item.durationMs} мс · открыть</AppText>
      </Pressable>)}
    </View> : null}
  </View>;
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
  runnerSection: { gap: 14 },
  editor: { minHeight: 220, borderWidth: 1, borderRadius: radii.md, padding: 14, fontSize: 14, lineHeight: 21,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
  runNotice: { padding: 14, borderRadius: radii.md }, runResult: { padding: 16, borderRadius: radii.lg, gap: 10 },
  testRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 8 }, history: { gap: 10 },
  historyItem: { minHeight: 64, padding: 12, borderWidth: 1, borderRadius: radii.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  pressed: { opacity: 0.72 },
});
