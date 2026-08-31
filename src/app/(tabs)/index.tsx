import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { type Href, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { QuestionCard } from '@/components/cards/question-card';
import { VacancyCard } from '@/components/cards/vacancy-card';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionTitle } from '@/components/section-title';
import { SpecialtyPicker } from '@/components/specialty-picker';
import { AppText } from '@/components/ui/app-text';
import { PrimaryButton } from '@/components/ui/primary-button';
import { questions, vacancies } from '@/data/mock-data';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppStore } from '@/store/use-app-store';
import { usePreparationStore } from '@/store/use-preparation-store';
import { radii } from '@/theme/palette';
import type { InterviewQuestion, Specialty, Vacancy } from '@/types/domain';

type TodayItem =
  | { kind: 'question'; value: InterviewQuestion }
  | { kind: 'vacancy'; value: Vacancy };

export default function TodayScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const specialty = useAppStore((state) => state.specialty);
  const savedQuestionIds = useAppStore((state) => state.savedQuestionIds);
  const savedVacancyIds = useAppStore((state) => state.savedVacancyIds);
  const completedTaskIds = useAppStore((state) => state.completedTaskIds);
  const setSpecialty = useAppStore((state) => state.setSpecialty);
  const toggleQuestionSaved = useAppStore((state) => state.toggleQuestionSaved);
  const toggleVacancySaved = useAppStore((state) => state.toggleVacancySaved);
  const preparation = usePreparationStore((state) => state.snapshot);
  const planSessions = preparation?.plan?.sessions ?? [];
  const finishedSessions = planSessions.filter((session) => session.status === 'completed').length;
  const nextSession = planSessions.find((session) => session.status === 'pending');

  const data = useMemo<TodayItem[]>(() => {
    const question = questions.find((item) => item.specialty === specialty) ?? questions[0];
    const vacancy = vacancies.find((item) => item.specialty === specialty) ?? vacancies[0];
    return [
      { kind: 'question', value: question },
      { kind: 'vacancy', value: vacancy },
    ];
  }, [specialty]);

  const selectSpecialty = useCallback(
    (value: Specialty | 'Все') => {
      if (value !== 'Все') {
        setSpecialty(value);
        void Haptics.selectionAsync();
      }
    },
    [setSpecialty],
  );

  const openPractice = useCallback(() => router.push((preparation?.profile ? '/preparation' : '/preparation/onboarding') as Href), [preparation?.profile, router]);
  const openPlan = useCallback(() => router.push('/preparation' as Href), [router]);

  const renderItem = useCallback(
    ({ item, index }: { item: TodayItem; index: number }) => (
      <View style={styles.itemBlock}>
        <SectionTitle
          title={item.kind === 'question' ? 'Вопрос дня' : 'Подходящая вакансия'}
          detail={index === 0 ? '5–7 минут' : 'обновлено сегодня'}
        />
        {item.kind === 'question' ? (
          <QuestionCard
            question={item.value}
            saved={savedQuestionIds.includes(item.value.id)}
            onToggleSaved={toggleQuestionSaved}
          />
        ) : (
          <VacancyCard
            vacancy={item.value}
            saved={savedVacancyIds.includes(item.value.id)}
            onToggleSaved={toggleVacancySaved}
          />
        )}
      </View>
    ),
    [savedQuestionIds, savedVacancyIds, toggleQuestionSaved, toggleVacancySaved],
  );

  const keyExtractor = useCallback((item: TodayItem) => `${item.kind}-${item.value.id}`, []);

  const header = (
    <>
      <ScreenHeader
        eyebrow="Interview Atlas"
        title="Готовимся к офферу"
        subtitle="Короткая практика каждый день и свежие вакансии в одном месте."
      />
      <SpecialtyPicker value={specialty} onChange={selectSpecialty} />
      <View style={styles.headerBody}>
        <View style={[styles.hero, { backgroundColor: colors.accentSoft }]}>
          <View style={styles.heroTop}>
            <View style={[styles.heroIcon, { backgroundColor: colors.accent }]}>
              <Ionicons name="flame" size={22} color="#FFFFFF" />
            </View>
            <View style={styles.heroText}>
              <AppText variant="caption" color="accent">
                СЕРИЯ ПОДГОТОВКИ
              </AppText>
              <AppText variant="title">{nextSession ? nextSession.skillLabel : 'Начните с цели'}</AppText>
            </View>
          </View>
          <AppText color="secondary">
            {nextSession ? `${nextSession.durationMinutes} минут — и план пересчитается по вашему результату.` : 'Укажите дедлайн и доступное время — соберём выполнимую неделю.'}
          </AppText>
          <PrimaryButton label={nextSession ? 'Открыть сессию' : 'Настроить план'} icon="play" onPress={openPractice} />
        </View>

        <View style={styles.stats}>
          <Stat value={String(completedTaskIds.length)} label="решено" />
          <Stat value={String(savedQuestionIds.length)} label="вопросов" />
          <Stat value={String(savedVacancyIds.length)} label="вакансий" />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Открыть все учебные треки"
          android_ripple={{ color: colors.overlay }}
          onPress={openPlan}
          style={({ pressed }) => [
            styles.planRow,
            { backgroundColor: colors.surface, borderColor: colors.border },
            pressed && styles.pressed,
          ]}>
          <View style={styles.planText}>
            <AppText variant="label">План на неделю</AppText>
            <AppText variant="caption" color="secondary">
              {preparation?.profile ? `${finishedSessions} из ${planSessions.length} учебных сессий завершено` : 'Персональный график ещё не настроен'}
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.accent} />
        </Pressable>
      </View>
    </>
  );

  return (
    <Screen>
      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={4}
        windowSize={5}
      />
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <AppText variant="subtitle">{value}</AppText>
      <AppText variant="caption" color="muted">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 112 },
  headerBody: { paddingHorizontal: 20, gap: 14 },
  hero: { padding: 20, borderRadius: radii.lg, gap: 16 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  heroText: { flex: 1, gap: 2 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, minHeight: 76, padding: 12, borderWidth: 1, borderRadius: radii.md, gap: 2 },
  planRow: {
    minHeight: 72,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  planText: { flex: 1, gap: 2 },
  itemBlock: { paddingHorizontal: 20, paddingTop: 26, gap: 10 },
  pressed: { opacity: 0.72 },
});
