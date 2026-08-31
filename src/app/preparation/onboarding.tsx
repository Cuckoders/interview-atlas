import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { PrimaryButton } from '@/components/ui/primary-button';
import { useAppTheme } from '@/hooks/use-app-theme';
import { enableAndScheduleReminders } from '@/services/reminder-service';
import { savePreparationDiagnostic, savePreparationProfile } from '@/services/preparation-sync';
import { usePreparationStore } from '@/store/use-preparation-store';
import { useSessionStore } from '@/store/use-session-store';
import { useAppStore } from '@/store/use-app-store';
import { radii } from '@/theme/palette';
import type { Specialty } from '@/types/domain';
import { skillCatalog, type PreparationLevel, type PreparationProfileInput } from '@/types/preparation';

const specialties: Specialty[] = ['Frontend', 'Backend', 'Mobile', 'QA'];
const levels: PreparationLevel[] = ['Junior', 'Middle', 'Senior'];
const quietOptions = [
  { label: '22:00–08:00', start: 1320, end: 480 },
  { label: '23:00–07:00', start: 1380, end: 420 },
  { label: '00:00–08:00', start: 0, end: 480 },
];

export default function PreparationOnboardingScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const sessionStatus = useSessionStore((state) => state.status);
  const snapshot = usePreparationStore((state) => state.snapshot);
  const [step, setStep] = useState<1 | 2>(1);
  const [specialty, setSpecialty] = useState<Specialty>(snapshot?.profile?.specialty ?? 'Frontend');
  const [level, setLevel] = useState<PreparationLevel>(snapshot?.profile?.level ?? 'Middle');
  const [weeks, setWeeks] = useState(() => nearestWeeks(snapshot?.profile?.targetDate));
  const [companies, setCompanies] = useState(snapshot?.profile?.targetCompanies.join(', ') ?? '');
  const [sessionsPerWeek, setSessionsPerWeek] = useState(snapshot?.profile?.sessionsPerWeek ?? 4);
  const [sessionMinutes, setSessionMinutes] = useState(snapshot?.profile?.sessionMinutes ?? 30);
  const [reminders, setReminders] = useState(snapshot?.profile?.remindersEnabled ?? false);
  const [reminderHour, setReminderHour] = useState(snapshot?.profile?.reminderHour ?? 19);
  const [quiet, setQuiet] = useState(quietOptions.find((option) => option.start === snapshot?.profile?.quietStartMinute) ?? quietOptions[0]!);
  const [ratings, setRatings] = useState<Record<string, number>>(() => Object.fromEntries(
    Object.values(skillCatalog).flat().map((skill) => [skill.key, 3]),
  ));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skills = useMemo(() => skillCatalog[specialty], [specialty]);

  if (sessionStatus !== 'signedIn') {
    return (
      <View style={styles.centered}>
        <View style={[styles.iconCircle, { backgroundColor: colors.accentSoft }]}><Ionicons name="cloud-outline" size={30} color={colors.accent} /></View>
        <AppText variant="title" style={styles.centerText}>Войдите для персонального плана</AppText>
        <AppText color="secondary" style={styles.centerText}>План и прогресс будут доступны на всех ваших устройствах.</AppText>
        <PrimaryButton label="Перейти к аккаунту" icon="person-outline" onPress={() => router.replace('/account')} />
      </View>
    );
  }

  const profile = (): PreparationProfileInput => {
    const target = new Date(); target.setDate(target.getDate() + weeks * 7);
    return {
      specialty, level, targetDate: localDate(target),
      targetCompanies: companies.split(',').map((value) => value.trim()).filter(Boolean).slice(0, 12),
      sessionsPerWeek, sessionMinutes, remindersEnabled: reminders, reminderHour, reminderMinute: 0,
      quietStartMinute: quiet.start, quietEndMinute: quiet.end,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    };
  };

  const next = async () => {
    setBusy(true); setError(null);
    try { await savePreparationProfile(profile()); useAppStore.getState().setSpecialty(specialty); setStep(2); }
    catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  };

  const finish = async () => {
    setBusy(true); setError(null);
    try {
      await savePreparationDiagnostic(Object.fromEntries(skills.map((skill) => [skill.key, ratings[skill.key] ?? 3])));
      let current = usePreparationStore.getState().snapshot;
      if (reminders && current) {
        const granted = await enableAndScheduleReminders(current);
        if (!granted) {
          await savePreparationProfile({ ...profile(), remindersEnabled: false });
          current = usePreparationStore.getState().snapshot;
          Alert.alert('Уведомления выключены', 'Разрешение не выдано. План сохранён без напоминаний — их можно включить позже.');
        }
      }
      if (current) router.dismissTo('/preparation' as Href);
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.progressHeader}>
          <AppText variant="caption" color="accent">ШАГ {step} ИЗ 2</AppText>
          <AppText variant="title">{step === 1 ? 'Ритм подготовки' : 'Карта навыков'}</AppText>
          <AppText color="secondary">{step === 1 ? 'Соберём реалистичный график под вашу цель.' : 'Оцените себя честно: план начнётся со слабых тем.'}</AppText>
        </View>

        {step === 1 ? (
          <View style={styles.form}>
            <ChoiceSection title="Направление" values={specialties} selected={specialty} onSelect={(value) => setSpecialty(value as Specialty)} />
            <ChoiceSection title="Уровень вакансий" values={levels} selected={level} onSelect={(value) => setLevel(value as PreparationLevel)} />
            <ChoiceSection title="До интервью" values={[2, 4, 8, 12]} selected={weeks} label={(value) => `${value} нед.`} onSelect={(value) => setWeeks(value as number)} />
            <View style={styles.section}>
              <AppText variant="label">Целевые компании</AppText>
              <TextInput
                accessibilityLabel="Целевые компании через запятую" value={companies} onChangeText={setCompanies}
                placeholder="Например: Яндекс, Ozon" placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              />
            </View>
            <ChoiceSection title="Сессий в неделю" values={[3, 4, 5, 7]} selected={sessionsPerWeek} onSelect={(value) => setSessionsPerWeek(value as number)} />
            <ChoiceSection title="Длительность" values={[20, 30, 45, 60]} selected={sessionMinutes} label={(value) => `${value} мин`} onSelect={(value) => setSessionMinutes(value as number)} />

            <Pressable
              accessibilityRole="switch" accessibilityState={{ checked: reminders }} onPress={() => setReminders((value) => !value)}
              style={[styles.toggleRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.grow}><AppText variant="label">Напоминания</AppText><AppText variant="caption" color="secondary">Разрешение спросим после сохранения плана</AppText></View>
              <View style={[styles.switchTrack, { backgroundColor: reminders ? colors.accent : colors.border }]}>
                <View style={[styles.switchKnob, reminders && styles.switchOn]} />
              </View>
            </Pressable>
            {reminders ? (
              <>
                <ChoiceSection title="Время" values={[9, 13, 18, 19, 20]} selected={reminderHour} label={(value) => `${String(value).padStart(2, '0')}:00`} onSelect={(value) => setReminderHour(value as number)} />
                <ChoiceSection title="Не беспокоить" values={quietOptions} selected={quiet} label={(value) => value.label} onSelect={(value) => setQuiet(value as typeof quiet)} />
              </>
            ) : null}
          </View>
        ) : (
          <View style={styles.form}>
            {skills.map((skill) => (
              <View key={skill.key} style={[styles.skillRating, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <AppText variant="label">{skill.label}</AppText>
                <View style={styles.chips}>{[1, 2, 3, 4, 5].map((value) => (
                  <Chip key={value} label={String(value)} selected={ratings[skill.key] === value} onPress={() => setRatings((current) => ({ ...current, [skill.key]: value }))} />
                ))}</View>
              </View>
            ))}
            <AppText variant="caption" color="secondary">1 — только знакомлюсь, 5 — уверенно объясняю и применяю на практике.</AppText>
          </View>
        )}
        {error ? <AppText accessibilityRole="alert" style={{ color: colors.warning }}>{error}</AppText> : null}
        <PrimaryButton label={busy ? 'Сохраняем…' : step === 1 ? 'Перейти к диагностике' : 'Сформировать план'} icon="arrow-forward" onPress={() => { if (!busy) void (step === 1 ? next() : finish()); }} />
        {step === 2 ? <PrimaryButton label="Назад к настройкам" secondary onPress={() => setStep(1)} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type ChoiceSectionProps<T> = { title: string; values: T[]; selected: T; onSelect: (value: T) => void; label?: (value: T) => string };
function ChoiceSection<T>({ title, values, selected, onSelect, label = String }: ChoiceSectionProps<T>) {
  return <View style={styles.section}><AppText variant="label">{title}</AppText><View style={styles.chips}>{values.map((value) => <Chip key={choiceKey(value)} label={label(value)} selected={selected === value} onPress={() => onSelect(value)} />)}</View></View>;
}
function messageOf(error: unknown): string { return error instanceof Error ? error.message : 'Не удалось сохранить план'; }
function choiceKey(value: unknown): string { return typeof value === 'object' ? JSON.stringify(value) : String(value); }
function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function nearestWeeks(targetDate?: string): number {
  if (!targetDate) return 8;
  const difference = Math.max(1, Math.round((new Date(`${targetDate}T12:00:00`).getTime() - Date.now()) / (7 * 24 * 60 * 60_000)));
  return [2, 4, 8, 12].reduce((best, value) => Math.abs(value - difference) < Math.abs(best - difference) ? value : best, 8);
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, content: { padding: 20, paddingBottom: 48, gap: 20 }, progressHeader: { gap: 8 },
  form: { gap: 20 }, section: { gap: 10 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: 16, fontSize: 16 },
  toggleRow: { minHeight: 76, borderWidth: 1, borderRadius: radii.md, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16 },
  grow: { flex: 1, gap: 3 }, switchTrack: { width: 52, minHeight: 32, borderRadius: 16, padding: 3 },
  switchKnob: { minWidth: 26, minHeight: 26, alignSelf: 'flex-start', borderRadius: 13, backgroundColor: '#FFFFFF' }, switchOn: { transform: [{ translateX: 20 }] },
  skillRating: { borderWidth: 1, borderRadius: radii.md, padding: 16, gap: 12 },
  centered: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 16 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' }, centerText: { textAlign: 'center' },
});
