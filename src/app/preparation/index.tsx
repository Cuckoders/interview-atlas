import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { PrimaryButton } from '@/components/ui/primary-button';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  completePreparationSession,
  initializePreparation,
  manuallyRegeneratePreparation,
} from '@/services/preparation-sync';
import { usePreparationStore } from '@/store/use-preparation-store';
import { useSessionStore } from '@/store/use-session-store';
import { radii } from '@/theme/palette';
import type { CompletionQuality, PreparationSession, SkillMastery } from '@/types/preparation';

const qualityLabels: { value: CompletionQuality; label: string }[] = [
  { value: 'hard', label: 'Сложно' }, { value: 'good', label: 'Нормально' }, { value: 'easy', label: 'Легко' },
];

export default function PreparationPlanScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ session?: string }>();
  const sessionStatus = useSessionStore((state) => state.status);
  const snapshot = usePreparationStore((state) => state.snapshot);
  const status = usePreparationStore((state) => state.status);
  const error = usePreparationStore((state) => state.error);
  const pendingCount = usePreparationStore((state) => state.pendingCount);
  const [ratingSession, setRatingSession] = useState<string | null>(null);
  const sessions = snapshot?.plan?.sessions ?? [];
  const completed = sessions.filter((session) => session.status === 'completed').length;

  const refresh = useCallback(() => { void initializePreparation(); }, []);
  const rate = useCallback(async (sessionId: string, quality: CompletionQuality) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRatingSession(null);
    await completePreparationSession(sessionId, quality);
  }, []);
  const renderItem = useCallback(({ item }: { item: PreparationSession }) => (
    <SessionCard
      session={item}
      focused={params.session === item.id}
      rating={ratingSession === item.id}
      onOpenRating={setRatingSession}
      onRate={rate}
    />
  ), [params.session, rate, ratingSession]);
  const keyExtractor = useCallback((item: PreparationSession) => item.id, []);

  const header = useMemo(() => {
    if (sessionStatus !== 'signedIn') return <EmptyState title="Войдите в аккаунт" detail="Персональный план синхронизируется между устройствами." action="Перейти к аккаунту" onPress={() => router.push('/account')} />;
    if (!snapshot?.profile) return <EmptyState title="Настройте цель" detail="Укажите направление, дедлайн и доступное время — приложение соберёт первую неделю." action="Создать план" onPress={() => router.push('/preparation/onboarding' as Href)} />;
    return (
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <AppText variant="caption" color="accent">ПЕРСОНАЛЬНЫЙ ПЛАН</AppText>
          <AppText variant="title">Неделя до следующего шага</AppText>
          <AppText color="secondary">{completed} из {sessions.length} сессий · по {snapshot.profile.sessionMinutes} минут</AppText>
        </View>
        <View style={[styles.progressCard, { backgroundColor: colors.accentSoft }]}>
          <View style={styles.progressTop}><AppText variant="subtitle">{Math.round((completed / Math.max(1, sessions.length)) * 100)}%</AppText><AppText variant="caption" color="secondary">выполнено</AppText></View>
          <View style={[styles.progressTrack, { backgroundColor: colors.surface }]}><View style={[styles.progressFill, { width: `${(completed / Math.max(1, sessions.length)) * 100}%`, backgroundColor: colors.accent }]} /></View>
          {pendingCount ? <AppText variant="caption" color="secondary">{pendingCount} действие ожидает сеть</AppText> : null}
        </View>
        <View style={styles.sectionHeader}><AppText variant="subtitle">Карта навыков</AppText><Pressable accessibilityRole="button" onPress={() => router.push('/preparation/onboarding' as Href)} style={styles.textButton}><AppText variant="label" color="accent">Настроить</AppText></Pressable></View>
        <View style={styles.skillList}>{snapshot.skills.map((skill) => <SkillRow key={skill.key} skill={skill} />)}</View>
        <View style={styles.sectionHeader}><AppText variant="subtitle">Ближайшие сессии</AppText><Pressable accessibilityRole="button" onPress={() => void manuallyRegeneratePreparation()} style={styles.textButton}><Ionicons name="refresh" size={19} color={colors.accent} /><AppText variant="label" color="accent">Пересчитать</AppText></Pressable></View>
      </View>
    );
  }, [colors, completed, pendingCount, router, sessionStatus, sessions.length, snapshot]);

  if (status === 'loading' && !snapshot) {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} /><AppText color="secondary">Собираем план…</AppText></View>;
  }

  return (
    <FlatList
      data={snapshot?.profile ? sessions : []} renderItem={renderItem} keyExtractor={keyExtractor}
      ListHeaderComponent={header} ListEmptyComponent={snapshot?.profile ? <EmptyState title="План пуст" detail="Обновите его или измените настройки подготовки." action="Пересчитать" onPress={() => void manuallyRegeneratePreparation()} /> : null}
      ListFooterComponent={error ? <AppText accessibilityRole="alert" style={[styles.error, { color: colors.warning }]}>{error}</AppText> : <View style={styles.footer} />}
      contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={status === 'syncing'} onRefresh={refresh} tintColor={colors.accent} colors={[colors.accent]} />}
      showsVerticalScrollIndicator={false} initialNumToRender={7} windowSize={5} removeClippedSubviews
    />
  );
}

const SessionCard = memo(function SessionCard({ session, focused, rating, onOpenRating, onRate }: {
  session: PreparationSession; focused: boolean; rating: boolean;
  onOpenRating: (id: string) => void; onRate: (id: string, quality: CompletionQuality) => void;
}) {
  const { colors } = useAppTheme();
  const completed = session.status === 'completed';
  return (
    <View style={[styles.sessionCard, { backgroundColor: focused ? colors.accentSoft : colors.surface, borderColor: focused ? colors.accent : colors.border }]}>
      <View style={styles.sessionTop}>
        <View style={[styles.kindIcon, { backgroundColor: completed ? colors.accentSoft : colors.surfaceRaised }]}><Ionicons name={completed ? 'checkmark' : kindIcon(session.kind)} size={21} color={colors.accent} /></View>
        <View style={styles.grow}><AppText variant="caption" color="accent">{formatDay(session.date)} · {session.durationMinutes} МИН</AppText><AppText variant="subtitle">{session.title}</AppText></View>
      </View>
      <AppText color="secondary">{session.description}</AppText>
      {completed ? <AppText variant="label" color="accent">Готово · {qualityLabel(session.quality)}</AppText> : rating ? (
        <View style={styles.ratingBlock}><AppText variant="caption" color="secondary">Как прошла сессия?</AppText><View style={styles.qualityRow}>{qualityLabels.map((item) => <Chip key={item.value} label={item.label} onPress={() => void onRate(session.id, item.value)} />)}</View></View>
      ) : <PrimaryButton label="Отметить выполненной" icon="checkmark-circle-outline" secondary onPress={() => onOpenRating(session.id)} />}
    </View>
  );
});

function SkillRow({ skill }: { skill: SkillMastery }) {
  const { colors } = useAppTheme();
  return <View style={styles.skillRow}><View style={styles.skillName}><AppText variant="label">{skill.label}</AppText><AppText variant="caption" color="secondary">{skill.score}/100</AppText></View><View style={[styles.skillTrack, { backgroundColor: colors.surfaceRaised }]}><View style={[styles.skillFill, { width: `${skill.score}%`, backgroundColor: skill.score < 45 ? colors.warm : colors.accent }]} /></View></View>;
}
function EmptyState({ title, detail, action, onPress }: { title: string; detail: string; action: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <View style={styles.empty}><View style={[styles.emptyIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="calendar-outline" size={30} color={colors.accent} /></View><AppText variant="title" style={styles.centerText}>{title}</AppText><AppText color="secondary" style={styles.centerText}>{detail}</AppText><PrimaryButton label={action} icon="arrow-forward" onPress={onPress} /></View>;
}
function kindIcon(kind: PreparationSession['kind']): keyof typeof Ionicons.glyphMap { return { theory: 'book-outline', question: 'chatbubble-ellipses-outline', practice: 'code-slash-outline', review: 'repeat-outline' }[kind] as keyof typeof Ionicons.glyphMap; }
function qualityLabel(value?: CompletionQuality) { return qualityLabels.find((item) => item.value === value)?.label ?? 'завершено'; }
function formatDay(value: string) { return new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`)); }

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 12 }, header: { gap: 20, marginBottom: 12 }, titleBlock: { gap: 7 },
  progressCard: { borderRadius: radii.lg, padding: 18, gap: 10 }, progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  progressTrack: { height: 9, borderRadius: 5, overflow: 'hidden' }, progressFill: { height: 9, borderRadius: 5 },
  sectionHeader: { minHeight: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  textButton: { minHeight: 48, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  skillList: { gap: 12 }, skillRow: { gap: 6 }, skillName: { flexDirection: 'row', justifyContent: 'space-between' },
  skillTrack: { height: 8, borderRadius: 4, overflow: 'hidden' }, skillFill: { height: 8, borderRadius: 4 },
  sessionCard: { borderWidth: 1, borderRadius: radii.md, padding: 16, gap: 14, marginBottom: 12 }, sessionTop: { flexDirection: 'row', gap: 12 },
  kindIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }, grow: { flex: 1, gap: 3 },
  ratingBlock: { gap: 10 }, qualityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, footer: { paddingBottom: 24 },
  error: { paddingVertical: 16 }, empty: { paddingVertical: 52, alignItems: 'center', gap: 14 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' }, centerText: { textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
});
