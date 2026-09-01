import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { DetailLayout } from '@/components/detail-layout';
import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { PrimaryButton } from '@/components/ui/primary-button';
import { useAppTheme } from '@/hooks/use-app-theme';
import { ApiAccountError } from '@/services/account-api';
import {
  cacheSimulation, clearCachedSimulation, getLearningCacheOwner, readCachedSimulation,
} from '@/services/learning-lab-cache';
import { fetchInterviewSimulation, finishInterviewSimulation, saveSimulationAnswer, startInterviewSimulation } from '@/services/learning-lab-api';
import { useAppStore } from '@/store/use-app-store';
import { useSessionStore } from '@/store/use-session-store';
import { radii } from '@/theme/palette';
import type { InterviewSimulation } from '@/types/learning-lab';

const durations = [15, 30, 45] as const;

export default function SimulationScreen() {
  const { colors } = useAppTheme();
  const specialty = useAppStore((state) => state.specialty);
  const sessionStatus = useSessionStore((state) => state.status);
  const user = useSessionStore((state) => state.user);
  const owner = user?.id ?? (sessionStatus === 'restoring' ? getLearningCacheOwner() : null) ?? 'local';
  const [duration, setDuration] = useState<(typeof durations)[number]>(30);
  const [simulation, setSimulation] = useState<InterviewSimulation | null>(null);
  const [answer, setAnswer] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [loadedOwner, setLoadedOwner] = useState<string | null>(null);
  const loading = loadedOwner !== owner;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const promptStartedAt = useRef<number | null>(null);
  const finishing = useRef(false);
  const savingAnswer = useRef(false);
  const nextExpiryFinishAttemptAt = useRef(0);
  const mutationVersion = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const refreshVersion = ++mutationVersion.current;
    void (async () => {
      const cached = await readCachedSimulation(owner);
      if (!cancelled && mutationVersion.current === refreshVersion) {
        setSimulation(cached);
        if (cached?.status === 'active') promptStartedAt.current = restoredPromptStartedAt(cached);
        else promptStartedAt.current = null;
        setLoadedOwner(owner);
      }
      if (sessionStatus === 'signedIn' && cached) {
        try {
          const live = await fetchInterviewSimulation(cached.id);
          if (!cancelled && mutationVersion.current === refreshVersion) {
            setSimulation(live);
            if (live.status === 'active') promptStartedAt.current = restoredPromptStartedAt(live);
            await cacheSimulation(owner, live);
          }
        } catch (caught) {
          if (caught instanceof ApiAccountError && caught.status === 404
            && !cancelled && mutationVersion.current === refreshVersion) {
            setSimulation(null);
            promptStartedAt.current = null;
            await clearCachedSimulation(owner);
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [owner, sessionStatus]);

  const currentIndex = useMemo(() => {
    if (!simulation) return 0;
    const answered = new Set(simulation.answers.map((item) => item.promptId));
    const next = simulation.prompts.findIndex((item) => !answered.has(item.id));
    return next < 0 ? simulation.prompts.length - 1 : next;
  }, [simulation]);
  const prompt = simulation?.prompts[currentIndex];

  useEffect(() => { nextExpiryFinishAttemptAt.current = 0; }, [simulation?.id]);

  const finish = useCallback(async (): Promise<boolean> => {
    if (!simulation || finishing.current || savingAnswer.current || simulation.status === 'finished') return false;
    mutationVersion.current += 1;
    finishing.current = true; setSubmitting(true); setError(null);
    const submittedAnswer = answer.trim();
    try {
      const draft = prompt && submittedAnswer ? {
        promptId: prompt.id, response: submittedAnswer,
        spentSeconds: elapsedPromptSeconds(promptStartedAt.current),
      } : undefined;
      const result = await finishInterviewSimulation(simulation.id, draft); setSimulation(result);
      const draftAccepted = !draft || result.answers.some((item) => item.promptId === draft.promptId && item.response === draft.response);
      if (draftAccepted) setAnswer((current) => current.trim() === submittedAnswer ? '' : current);
      else setError('Время интервью истекло до получения последнего ответа. Он оставлен в поле, чтобы вы могли его скопировать.');
      await cacheSimulation(owner, result);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось завершить симуляцию');
      return false;
    }
    finally { finishing.current = false; setSubmitting(false); }
  }, [answer, owner, prompt, simulation]);

  const start = useCallback(async () => {
    if (sessionStatus !== 'signedIn') return;
    mutationVersion.current += 1;
    setSubmitting(true); setError(null);
    try {
      const value = await startInterviewSimulation(specialty, duration); setSimulation(value); setAnswer('');
      promptStartedAt.current = Date.now(); await cacheSimulation(owner, value);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось создать симуляцию'); }
    finally { setSubmitting(false); }
  }, [duration, owner, sessionStatus, specialty]);

  const saveAnswer = useCallback(async (): Promise<boolean> => {
    if (!simulation || !prompt || !answer.trim() || savingAnswer.current || finishing.current) return false;
    mutationVersion.current += 1;
    savingAnswer.current = true; setSubmitting(true); setError(null);
    const submittedAnswer = answer.trim();
    try {
      const input = { promptId: prompt.id, response: submittedAnswer, spentSeconds: elapsedPromptSeconds(promptStartedAt.current) };
      const answeredPromptIds = new Set(simulation.answers.map((item) => item.promptId));
      const isFinalAnswer = simulation.prompts.every((item) => item.id === prompt.id || answeredPromptIds.has(item.id));
      const value = isFinalAnswer
        ? await finishInterviewSimulation(simulation.id, input)
        : await saveSimulationAnswer(simulation.id, input);
      setSimulation(value); setAnswer((current) => current.trim() === submittedAnswer ? '' : current); promptStartedAt.current = Date.now(); await cacheSimulation(owner, value);
      void Haptics.selectionAsync();
      return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось сохранить ответ'); return false; }
    finally { savingAnswer.current = false; setSubmitting(false); }
  }, [answer, owner, prompt, simulation]);

  useEffect(() => {
    if (!simulation || simulation.status !== 'active') return;
    const update = () => {
      const serverNow = Date.now() + (simulation.clockOffsetMs ?? 0);
      const seconds = Math.max(0, Math.ceil((Date.parse(simulation.endsAt) - serverNow) / 1_000));
      setRemaining(seconds);
      if (seconds <= 5 && Date.now() >= nextExpiryFinishAttemptAt.current && !savingAnswer.current) {
        nextExpiryFinishAttemptAt.current = Date.now() + 15_000;
        void finish();
      }
    };
    update(); const timer = setInterval(update, 1_000); return () => clearInterval(timer);
  }, [finish, simulation]);

  const reset = useCallback(async () => {
    mutationVersion.current += 1; setSimulation(null); setAnswer(''); setError(null); await clearCachedSimulation(owner);
  }, [owner]);

  if (loading) return <DetailLayout><ActivityIndicator color={colors.accent} /></DetailLayout>;
  if (!simulation) return <DetailLayout>
    <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name="mic-outline" size={32} color={colors.accent} />
      <AppText variant="display">Симуляция интервью</AppText>
      <AppText color="secondary">Серия актуальных вопросов с серверным таймером. Итог показывает полноту и темп ответа, но не подменяет оценку интервьюера.</AppText>
    </View>
    <View style={styles.section}><AppText variant="subtitle">Направление</AppText><Chip label={specialty} selected /></View>
    <View style={styles.section}><AppText variant="subtitle">Продолжительность</AppText><View style={styles.chips}>{durations.map((value) => <Chip key={value} label={`${value} мин`} selected={duration === value} onPress={() => setDuration(value)} />)}</View></View>
    {sessionStatus !== 'signedIn' ? <Notice text="Войдите в аккаунт: таймер и ответы хранятся на backend и восстанавливаются после перезапуска." /> : null}
    {error ? <Notice text={error} /> : null}
    <PrimaryButton label="Начать интервью" icon="play" loading={submitting} disabled={sessionStatus !== 'signedIn'} onPress={start} />
  </DetailLayout>;

  if (simulation.status === 'finished' && simulation.result) return <DetailLayout>
    <View style={[styles.score, { backgroundColor: colors.accentSoft }]}><AppText variant="display" style={{ color: colors.accentText }}>{simulation.result.score}%</AppText><AppText variant="subtitle">Итог симуляции</AppText><AppText color="secondary">{simulation.result.summary}</AppText></View>
    {error ? <Notice text={error} /> : null}
    <ResultSection title="Сильные ответы" items={simulation.result.strengths} empty="Пока недостаточно развёрнутых ответов." icon="checkmark-circle" />
    <ResultSection title="Что повторить" items={simulation.result.improvements} empty="Основные ответы были развёрнутыми." icon="trail-sign-outline" />
    <PrimaryButton label="Новая симуляция" icon="refresh" onPress={reset} />
  </DetailLayout>;

  return <DetailLayout>
    <View style={styles.timerRow}><View><AppText variant="caption" color="muted">ВОПРОС {currentIndex + 1} ИЗ {simulation.prompts.length}</AppText><AppText variant="title">{formatRemaining(remaining)}</AppText></View><Chip label={simulation.specialty} /></View>
    <View style={[styles.promptCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><AppText variant="caption" color="accent">{prompt?.type === 'task' ? 'Практический кейс' : 'Теоретический вопрос'}</AppText><AppText variant="title">{prompt?.title}</AppText>{prompt?.statement ? <AppText color="secondary">{prompt.statement}</AppText> : null}<View style={styles.chips}>{prompt?.tags.map((tag) => <Chip key={tag} label={tag} />)}</View></View>
    <TextInput value={answer} onChangeText={setAnswer} editable={!submitting} multiline textAlignVertical="top" accessibilityLabel="Ответ на вопрос"
      placeholder="Структурируйте ответ: уточнения → подход → компромиссы → проверка…" placeholderTextColor={colors.textMuted}
      style={[styles.answer, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
    {error ? <Notice text={error} /> : null}
    <PrimaryButton label={currentIndex === simulation.prompts.length - 1 ? 'Сохранить и завершить' : 'Сохранить и дальше'}
      icon="arrow-forward" loading={submitting} disabled={!answer.trim()} onPress={saveAnswer} />
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: submitting }} disabled={submitting}
      onPress={finish} style={[styles.finishButton, submitting && styles.disabled]}><AppText variant="label" color="muted">Завершить сейчас</AppText></Pressable>
  </DetailLayout>;
}

function ResultSection({ title, items, empty, icon }: { title: string; items: string[]; empty: string; icon: keyof typeof Ionicons.glyphMap }) {
  const { colors } = useAppTheme(); return <View style={styles.section}><AppText variant="subtitle">{title}</AppText>{items.length ? items.map((item) => <View key={item} style={styles.resultRow}><Ionicons name={icon} size={20} color={colors.accent} /><AppText style={{ flex: 1 }}>{item}</AppText></View>) : <AppText color="secondary">{empty}</AppText>}</View>;
}
function Notice({ text }: { text: string }) { const { colors } = useAppTheme(); return <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: colors.warmSoft }]}><AppText variant="caption" style={{ color: colors.warning }}>{text}</AppText></View>; }
function formatRemaining(seconds: number) { return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`; }
function elapsedPromptSeconds(startedAt: number | null) { return Math.min(3_600, Math.max(0, Math.round((Date.now() - (startedAt ?? Date.now())) / 1_000))); }
function restoredPromptStartedAt(simulation: InterviewSimulation): number {
  const serverTimestamp = simulation.answers.reduce((latest, item) => Math.max(latest, Date.parse(item.answeredAt)), Date.parse(simulation.startedAt));
  return serverTimestamp - (simulation.clockOffsetMs ?? 0);
}

const styles = StyleSheet.create({
  hero: { padding: 20, borderWidth: 1, borderRadius: radii.lg, gap: 12 }, section: { gap: 12 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  notice: { padding: 14, borderRadius: radii.md }, score: { padding: 20, borderRadius: radii.lg, gap: 10 },
  timerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  promptCard: { padding: 18, borderWidth: 1, borderRadius: radii.lg, gap: 12 }, answer: { minHeight: 220, borderWidth: 1, borderRadius: radii.lg, padding: 16, fontSize: 16, lineHeight: 24 },
  finishButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' }, resultRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  disabled: { opacity: 0.5 },
});
