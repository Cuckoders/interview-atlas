import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { DetailLayout } from '@/components/detail-layout';
import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { PrimaryButton } from '@/components/ui/primary-button';
import { useAppTheme } from '@/hooks/use-app-theme';
import { ApiAccountError } from '@/services/account-api';
import { fetchVacancyMatch, fetchVacancyPreparationPlan, generateVacancyPreparationPlan } from '@/services/vacancy-intelligence-api';
import { cacheMatch, cacheVacancyPlan, readCachedMatch, readCachedVacancyPlan } from '@/services/vacancy-intelligence-cache';
import { useSessionStore } from '@/store/use-session-store';
import { radii } from '@/theme/palette';
import type { VacancyMatch, VacancyPreparationPlan } from '@/types/vacancy-intelligence';

export default function VacancyMatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useAppTheme();
  const sessionStatus = useSessionStore((state) => state.status);
  const user = useSessionStore((state) => state.user);
  const [match, setMatch] = useState<VacancyMatch | null>(null);
  const [plan, setPlan] = useState<VacancyPreparationPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const load = useCallback(async () => {
    if (!id || !user) { setLoading(false); return; }
    setLoading(true);
    const [cachedMatch, cachedPlan] = await Promise.all([
      readCachedMatch(user.id, id), readCachedVacancyPlan(user.id, id),
    ]);
    if (cachedMatch) setMatch(cachedMatch);
    if (cachedPlan) setPlan(cachedPlan);
    try {
      const [liveMatch, livePlan] = await Promise.all([fetchVacancyMatch(id), fetchVacancyPreparationPlan(id)]);
      setMatch(liveMatch); setPlan(livePlan.plan); setError(null);
      await cacheMatch(user.id, id, liveMatch);
      if (livePlan.plan) await cacheVacancyPlan(user.id, id, livePlan.plan);
    } catch (caught) {
      const api = caught instanceof ApiAccountError ? caught : null;
      setError({ code: api?.code ?? 'offline', message: api?.message ?? 'Не удалось обновить расчёт. Проверьте соединение.' });
    } finally { setLoading(false); }
  }, [id, user]);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);

  const generate = useCallback(async () => {
    if (!id || !user) return;
    setGenerating(true);
    try {
      const next = await generateVacancyPreparationPlan(id);
      setPlan(next); setError(null);
      await cacheVacancyPlan(user.id, id, next);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (caught) {
      const api = caught instanceof ApiAccountError ? caught : null;
      setError({ code: api?.code ?? 'offline', message: api?.message ?? 'Не удалось создать план.' });
    } finally { setGenerating(false); }
  }, [id, user]);

  if (sessionStatus === 'restoring' || (loading && !match)) {
    return <DetailLayout><ActivityIndicator color={colors.accent} /></DetailLayout>;
  }
  if (!user) {
    return <DetailLayout><StateCard icon="person-circle-outline" title="Нужен аккаунт" text="Войдите, чтобы сопоставить диагностику и профиль с требованиями вакансии." />
      <PrimaryButton label="Открыть аккаунт" onPress={() => router.push('/(tabs)/account')} /></DetailLayout>;
  }
  if (!match) {
    const profileRequired = error?.code === 'profile_required';
    return <DetailLayout><StateCard icon={profileRequired ? 'map-outline' : 'cloud-offline-outline'}
      title={profileRequired ? 'Сначала настройте профиль' : 'Расчёт пока недоступен'} text={error?.message ?? 'Попробуйте обновить данные.'} />
      <PrimaryButton label={profileRequired ? 'Настроить подготовку' : 'Повторить'}
        onPress={() => profileRequired ? router.push('/preparation/onboarding') : void load()} /></DetailLayout>;
  }

  return (
    <DetailLayout>
      <View style={[styles.scoreCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.scoreCircle, { backgroundColor: colors.accentSoft }]}>
          <AppText variant="display" color="accent">{match.score}</AppText>
          <AppText variant="caption" color="muted">из 100</AppText>
        </View>
        <View style={styles.scoreCopy}>
          <AppText variant="title">{match.label}</AppText>
          <AppText color="secondary">Оценка объясняется направлением, уровнем и подтверждёнными навыками.</AppText>
        </View>
      </View>
      {error ? <StateCard icon="cloud-offline-outline" title="Показан сохранённый расчёт" text={error.message} compact /> : null}
      <View style={styles.section}>
        <AppText variant="subtitle">Из чего сложилась оценка</AppText>
        {match.components.map((component) => (
          <View key={component.key} style={[styles.component, { borderColor: colors.border }]}>
            <View style={styles.rowBetween}>
              <AppText variant="label">{component.label}</AppText>
              <AppText variant="label" color="accent">{component.score}/{component.maximum}</AppText>
            </View>
            <View style={[styles.track, { backgroundColor: colors.border }]}>
              <View style={[styles.fill, { backgroundColor: colors.accent, width: `${Math.round(component.score / component.maximum * 100)}%` as `${number}%` }]} />
            </View>
            <AppText variant="caption" color="secondary">{component.explanation}</AppText>
          </View>
        ))}
      </View>
      <View style={styles.section}>
        <AppText variant="subtitle">Подтверждённые требования</AppText>
        <View style={styles.chips}>{match.matchedSkills.length ? match.matchedSkills.map((skill) => <Chip key={skill} label={skill} />)
          : <AppText color="secondary">Пока нет требований с оценкой 60/100 и выше.</AppText>}</View>
      </View>
      <View style={styles.section}>
        <AppText variant="subtitle">Что подтянуть</AppText>
        {match.gaps.length ? match.gaps.map((gap) => (
          <View key={gap.skill} style={[styles.gap, { backgroundColor: gap.priority === 'high' ? colors.warmSoft : colors.surface, borderColor: colors.border }]}>
            <Ionicons name={gap.priority === 'high' ? 'alert-circle-outline' : 'trending-up-outline'} size={22}
              color={gap.priority === 'high' ? colors.warning : colors.accent} />
            <View style={styles.gapCopy}><AppText variant="label">{gap.skill}</AppText><AppText variant="caption" color="secondary">{gap.reason}</AppText></View>
          </View>
        )) : <AppText color="secondary">Явных пробелов не найдено — план закрепит ключевые требования.</AppText>}
      </View>
      <View style={styles.section}>
        <View style={styles.rowBetween}><AppText variant="subtitle">План под вакансию</AppText>{plan ? <Chip label={`${plan.sessions.length} сессии`} /> : null}</View>
        {plan?.sessions.map((item, index) => (
          <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Открыть сессию ${item.title}`}
            android_ripple={{ color: colors.overlay }} onPress={() => router.push(item.href as Href)}
            style={({ pressed }) => [styles.session, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
            <View style={[styles.index, { backgroundColor: colors.accentSoft }]}><AppText variant="label" color="accent">{index + 1}</AppText></View>
            <View style={styles.gapCopy}><AppText variant="label">{item.title}</AppText><AppText variant="caption" color="secondary">{item.durationMinutes} мин · {item.description}</AppText></View>
            <Ionicons name="arrow-forward" size={20} color={colors.accent} />
          </Pressable>
        ))}
        <PrimaryButton label={plan ? 'Пересобрать план' : 'Создать план под вакансию'} icon="sparkles-outline"
          loading={generating} onPress={generate} />
      </View>
    </DetailLayout>
  );
}

function StateCard({ icon, title, text, compact = false }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string; compact?: boolean }) {
  const { colors } = useAppTheme();
  return <View style={[styles.state, compact && styles.stateCompact, { backgroundColor: colors.warmSoft }]}><Ionicons name={icon} size={24} color={colors.warning} />
    <View style={styles.gapCopy}><AppText variant="label">{title}</AppText><AppText variant="caption" color="secondary">{text}</AppText></View></View>;
}

const styles = StyleSheet.create({
  scoreCard: { padding: 18, borderWidth: 1, borderRadius: radii.lg, flexDirection: 'row', alignItems: 'center', gap: 16 },
  scoreCircle: { width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center' },
  scoreCopy: { flex: 1, gap: 6 }, section: { gap: 12 },
  component: { borderWidth: 1, borderRadius: radii.md, padding: 14, gap: 9 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  track: { height: 7, borderRadius: 4, overflow: 'hidden' }, fill: { height: 7, borderRadius: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gap: { padding: 14, borderWidth: 1, borderRadius: radii.md, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  gapCopy: { flex: 1, gap: 4 },
  session: { minHeight: 76, padding: 14, borderWidth: 1, borderRadius: radii.md, flexDirection: 'row', alignItems: 'center', gap: 11 },
  index: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  state: { padding: 16, borderRadius: radii.md, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  stateCompact: { padding: 13 }, pressed: { opacity: 0.72 },
});
