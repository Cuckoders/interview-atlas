import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView, type VideoSource } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, StyleSheet, View } from 'react-native';

import { DetailLayout, MissingDetail } from '@/components/detail-layout';
import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { PrimaryButton } from '@/components/ui/primary-button';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useLearningDetail } from '@/hooks/use-learning-detail';
import {
  cacheVideoProgress, clearCachedVideoProgress, getLearningCacheOwner, readCachedVideoProgress,
} from '@/services/learning-lab-cache';
import { fetchVideoProgress, saveVideoProgress, submitVideoQuiz } from '@/services/learning-lab-api';
import { useSessionStore } from '@/store/use-session-store';
import { radii } from '@/theme/palette';
import type { VideoLesson } from '@/types/domain';
import type { QuizResult, VideoProgress } from '@/types/learning-lab';

export default function VideoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const { item: video, loading } = useLearningDetail('video', id);
  if (loading) return <DetailLayout><ActivityIndicator color={colors.accent} /></DetailLayout>;
  if (!video) return <MissingDetail title="Видео не найдено" />;
  if (!isPlayableVideoUrl(video.url)) return <MissingDetail title="Для видео нужна прямая HTTPS-ссылка на медиапоток" />;
  return <VideoExperience key={`${video.id}:${video.contentVersion}`} video={video} />;
}

function VideoExperience({ video }: { video: VideoLesson }) {
  const { colors } = useAppTheme();
  const status = useSessionStore((state) => state.status);
  const user = useSessionStore((state) => state.user);
  const owner = user?.id ?? (status === 'restoring' ? getLearningCacheOwner() : null) ?? 'local';
  const source = useMemo<VideoSource>(() => ({
    uri: video.url, contentType: 'progressive', useCaching: Platform.OS !== 'web', metadata: { title: video.title, artist: video.author },
  }), [video.author, video.title, video.url]);
  const player = useVideoPlayer(source, (instance) => { instance.timeUpdateEventInterval = 5; });
  const quizKey = useMemo(
    () => `${owner}:${video.contentVersion}:${JSON.stringify(video.quiz ?? [])}`,
    [owner, video.contentVersion, video.quiz],
  );
  const [playerStatus, setPlayerStatus] = useState<'idle' | 'loading' | 'readyToPlay' | 'error'>('loading');
  const progressOwnerKey = `${owner}:${status}:${video.id}:${video.contentVersion}`;
  const [restoredProgressKey, setRestoredProgressKey] = useState<string | null>(null);
  const restoringProgress = restoredProgressKey !== progressOwnerKey;
  const [progress, setProgress] = useState<VideoProgress | null>(null);
  const [quizState, setQuizState] = useState<{ key: string; answers: Record<string, number>; result: QuizResult | null }>(
    () => ({ key: quizKey, answers: {}, result: null }),
  );
  const answers = useMemo(() => quizState.key === quizKey ? quizState.answers : {}, [quizKey, quizState]);
  const quizResult = quizState.key === quizKey ? quizState.result : null;
  const [quizLoading, setQuizLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const position = useRef(0);
  const duration = useRef(video.durationMinutes * 60);
  const completed = useRef(false);
  const bestQuizScore = useRef<number | null>(null);
  const restorationComplete = useRef(false);
  const cloudReconciled = useRef(false);
  const playbackTouched = useRef(false);
  const pendingGuestMigrationOwner = useRef<string | null>(null);
  const flushQueue = useRef<Promise<void>>(Promise.resolve());

  const flush = useCallback((updateUi = true): Promise<void> => {
    const shouldClearGuestAfterUpload = pendingGuestMigrationOwner.current === owner;
    const operation = flushQueue.current.then(async () => {
      if (!restorationComplete.current) return;
      completed.current = completed.current || (duration.current > 0 && position.current / duration.current >= 0.9);
      const value: VideoProgress = {
        videoId: video.id, contentVersion: video.contentVersion,
        positionSeconds: Math.round(position.current), durationSeconds: Math.round(duration.current),
        completed: completed.current,
        bestQuizScore: bestQuizScore.current, updatedAt: new Date().toISOString(),
      };
      await cacheVideoProgress(owner, value);
      if (status === 'signedIn' && cloudReconciled.current) {
        try {
          const saved = await saveVideoProgress(video.id, video.contentVersion, value.positionSeconds, value.durationSeconds, value.completed);
          const currentDuration = Math.round(duration.current);
          const durationChangedDuringRequest = currentDuration > 0 && currentDuration !== value.durationSeconds;
          const resolvedDuration = durationChangedDuringRequest ? currentDuration : saved.durationSeconds || value.durationSeconds;
          const furthestPosition = Math.max(saved.positionSeconds, value.positionSeconds, Math.round(position.current));
          const resolved: VideoProgress = {
            ...saved,
            positionSeconds: resolvedDuration > 0 ? Math.min(furthestPosition, resolvedDuration) : furthestPosition,
            durationSeconds: resolvedDuration,
            completed: saved.completed || completed.current,
            bestQuizScore: maxNullableScore(saved.bestQuizScore, bestQuizScore.current),
            updatedAt: new Date().toISOString(),
          };
          if (updateUi) setProgress(resolved);
          await cacheVideoProgress(owner, resolved);
          if (shouldClearGuestAfterUpload) {
            await clearCachedVideoProgress('local', video.id, video.contentVersion);
            if (pendingGuestMigrationOwner.current === owner) pendingGuestMigrationOwner.current = null;
          }
        }
        catch { /* Локальный прогресс сохранён и будет виден без сети. */ }
      }
    });
    flushQueue.current = operation.catch(() => undefined);
    return operation;
  }, [owner, status, video.contentVersion, video.id]);

  useEffect(() => {
    let cancelled = false;
    restorationComplete.current = false;
    cloudReconciled.current = false;
    playbackTouched.current = false;
    pendingGuestMigrationOwner.current = null;
    position.current = 0;
    duration.current = video.durationMinutes * 60;
    completed.current = false;
    bestQuizScore.current = null;
    const applyProgress = (value: VideoProgress, seek: boolean) => {
      position.current = value.positionSeconds;
      duration.current = value.durationSeconds || duration.current;
      completed.current = value.completed;
      bestQuizScore.current = value.bestQuizScore;
      if (seek) player.currentTime = value.positionSeconds;
      setProgress(value);
    };
    void (async () => {
      const [cached, guest] = await Promise.all([
        readCachedVideoProgress(owner, video.id, video.contentVersion),
        owner === 'local' ? Promise.resolve(null) : readCachedVideoProgress('local', video.id, video.contentVersion),
      ]);
      if (cancelled) return;
      setProgress(null);
      setQuizState({ key: quizKey, answers: {}, result: null });
      setQuizLoading(false);
      pendingGuestMigrationOwner.current = guest ? owner : null;
      let value = mergeProgress(cached, guest);
      if (value) applyProgress(value, true);
      else applyProgress({
        videoId: video.id,
        contentVersion: video.contentVersion,
        positionSeconds: 0,
        durationSeconds: video.durationMinutes * 60,
        completed: false,
        bestQuizScore: null,
        updatedAt: new Date().toISOString(),
      }, true);
      restorationComplete.current = true;
      setRestoredProgressKey(progressOwnerKey);
      if (status !== 'signedIn') return;
      try {
        const localValue = value;
        const serverValue = await fetchVideoProgress(video.id, video.contentVersion);
        value = mergeProgress(localValue, serverValue, true);
        const shouldUploadLocal = needsServerSync(value, serverValue);
        if (cancelled) return;
        if (value && !playbackTouched.current) applyProgress(value, true);
        else if (value) mergeMonotonicProgress(value, completed, bestQuizScore, setProgress);
        if (value) await cacheVideoProgress(owner, value);
        if (value && (guest || shouldUploadLocal)) {
          const saved = await saveVideoProgress(video.id, video.contentVersion, value.positionSeconds, value.durationSeconds, value.completed);
          value = mergeProgress(value, saved, true);
          if (value) await cacheVideoProgress(owner, value);
          if (guest) {
            await clearCachedVideoProgress('local', video.id, video.contentVersion);
            if (pendingGuestMigrationOwner.current === owner) pendingGuestMigrationOwner.current = null;
          }
        }
        cloudReconciled.current = true;
        if (playbackTouched.current) void flush();
      } catch {
        cloudReconciled.current = true;
        if (playbackTouched.current) void flush();
        /* Кеш уже доступен; сетевую синхронизацию повторим после следующего действия. */
      }
    })();
    const playingSubscription = player.addListener('playingChange', ({ isPlaying }) => {
      if (!restorationComplete.current) return;
      if (isPlaying) playbackTouched.current = true;
      else {
        capturePlayerPosition(player, position, duration, completed, playbackTouched);
        void flush();
      }
    });
    const timeSubscription = player.addListener('timeUpdate', ({ currentTime }) => {
      if (!restorationComplete.current) return;
      if (Math.abs(currentTime - position.current) > 1) playbackTouched.current = true;
      position.current = currentTime; duration.current = player.duration || duration.current;
      completed.current = completed.current || (duration.current > 0 && currentTime / duration.current >= 0.9);
      const value: VideoProgress = {
        videoId: video.id, contentVersion: video.contentVersion,
        positionSeconds: Math.round(currentTime), durationSeconds: Math.round(duration.current),
        completed: completed.current,
        bestQuizScore: bestQuizScore.current, updatedAt: new Date().toISOString(),
      };
      setProgress(value); void cacheVideoProgress(owner, value);
    });
    const statusSubscription = player.addListener('statusChange', ({ status: nextStatus }) => setPlayerStatus(nextStatus));
    const endSubscription = player.addListener('playToEnd', () => { position.current = player.duration; void flush(); });
    const appStateSubscription = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        capturePlayerPosition(player, position, duration, completed, playbackTouched);
        void flush();
      }
    });
    return () => {
      cancelled = true; playingSubscription.remove(); timeSubscription.remove(); statusSubscription.remove(); endSubscription.remove(); appStateSubscription.remove();
      capturePlayerPosition(player, position, duration, completed, playbackTouched);
      void flush(false);
    };
  }, [flush, owner, player, progressOwnerKey, quizKey, status, video.contentVersion, video.durationMinutes, video.id]);

  const submitQuiz = useCallback(async () => {
    if (!video.quiz?.length || status !== 'signedIn' || !video.quiz.every((question) => Number.isInteger(answers[question.id]))) return;
    setQuizLoading(true); setError(null);
    try {
      const result = await submitVideoQuiz(video.id, video.contentVersion, video.quiz.map((question) => ({ questionId: question.id, optionIndex: answers[question.id] ?? -1 })));
      bestQuizScore.current = Math.max(bestQuizScore.current ?? 0, result.score);
      setQuizState((current) => current.key === quizKey ? { ...current, result } : current);
      setProgress((current) => current ? { ...current, bestQuizScore: bestQuizScore.current } : current);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось проверить ответы'); }
    finally { setQuizLoading(false); }
  }, [answers, quizKey, status, video.contentVersion, video.id, video.quiz]);

  const percent = progress?.durationSeconds ? Math.min(100, Math.round(progress.positionSeconds / progress.durationSeconds * 100)) : 0;
  return (
    <DetailLayout>
      <View style={styles.videoFrame}>
        <VideoView player={player} style={[styles.video, { backgroundColor: colors.surfaceRaised }]} nativeControls={!restoringProgress} contentFit="contain" fullscreenOptions={{ enable: true }} />
        {restoringProgress ? <View accessibilityRole="progressbar" style={[styles.restoreOverlay, { backgroundColor: colors.surfaceRaised }]}><ActivityIndicator color={colors.accent} /><AppText variant="caption" color="muted">Восстанавливаем позицию…</AppText></View> : null}
      </View>
      {playerStatus === 'loading' ? <View style={styles.status}><ActivityIndicator color={colors.accent} /><AppText variant="caption" color="muted">Буферизация видео…</AppText></View> : null}
      {playerStatus === 'error' ? <Notice text="Видео не загрузилось. Проверьте сеть или URL в CMS." /> : null}
      <View style={styles.meta}><Chip label={video.specialty} /><Chip label={`${video.durationMinutes} мин`} /></View>
      <AppText variant="display">{video.title}</AppText>
      <AppText color="secondary">{video.author}</AppText>
      <View style={[styles.progressCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.rowBetween}><AppText variant="label">Продолжить с места</AppText><AppText variant="label" color="accent">{percent}%</AppText></View>
        <View style={[styles.track, { backgroundColor: colors.surfaceRaised }]}><View style={[styles.fill, { backgroundColor: colors.accent, width: `${percent}%` }]} /></View>
        <AppText variant="caption" color="muted">Позиция сохраняется при паузе, уходе в background и закрытии экрана.</AppText>
      </View>
      {video.quiz?.length ? <View style={styles.quiz}>
        <AppText variant="title">Проверка после видео</AppText>
        {video.quiz.map((question, index) => <View key={question.id} style={styles.question}>
          <AppText variant="subtitle">{index + 1}. {question.prompt}</AppText>
          {question.options.map((option, optionIndex) => {
            const selected = answers[question.id] === optionIndex;
            const result = quizResult?.results.find((item) => item.questionId === question.id);
            const correct = result?.correctIndex === optionIndex;
            return <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: quizLoading }} disabled={quizLoading}
              onPress={() => {
                setQuizState((current) => ({
                  key: quizKey,
                  answers: { ...(current.key === quizKey ? current.answers : {}), [question.id]: optionIndex },
                  result: null,
                }));
                void Haptics.selectionAsync();
              }}
              style={[styles.option, quizLoading && styles.disabled, { borderColor: correct && quizResult ? colors.success : selected ? colors.accent : colors.border,
                backgroundColor: selected ? colors.accentSoft : colors.surface }]}>
              <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? colors.accent : colors.textMuted} />
              <AppText style={styles.optionCopy}>{option}</AppText>
            </Pressable>;
          })}
          {quizResult ? <AppText variant="caption" color={quizResult.results[index]?.correct ? 'accent' : 'secondary'}>{quizResult.results[index]?.explanation}</AppText> : null}
        </View>)}
        {status !== 'signedIn' ? <Notice text="Войдите в аккаунт, чтобы проверить ответы и синхронизировать результат." /> : null}
        {error ? <Notice text={error} /> : null}
        {quizResult ? <AppText variant="subtitle">Результат: {quizResult.score}% · {quizResult.correctCount}/{quizResult.totalCount}</AppText> : null}
        <PrimaryButton label="Проверить ответы" icon="checkmark-done" loading={quizLoading}
          disabled={quizLoading || status !== 'signedIn' || !video.quiz.every((question) => Number.isInteger(answers[question.id]))} onPress={submitQuiz} />
      </View> : null}
    </DetailLayout>
  );
}

function Notice({ text }: { text: string }) {
  const { colors } = useAppTheme();
  return <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: colors.warmSoft }]}><Ionicons name="information-circle-outline" size={22} color={colors.warning} /><AppText variant="caption" style={[styles.optionCopy, { color: colors.warning }]}>{text}</AppText></View>;
}

function mergeProgress(left: VideoProgress | null, right: VideoProgress | null, rightAuthoritative = false): VideoProgress | null {
  if (!left) return right;
  if (!right) return left;
  if (left.contentVersion !== right.contentVersion) return rightAuthoritative ? right : left;
  const freshest = right.updatedAt >= left.updatedAt ? right : left;
  const durationSeconds = rightAuthoritative && right.durationSeconds > 0 && right.updatedAt >= left.updatedAt
    ? right.durationSeconds
    : freshest.durationSeconds > 0 ? freshest.durationSeconds : Math.max(left.durationSeconds, right.durationSeconds);
  const furthestPosition = Math.max(left.positionSeconds, right.positionSeconds);
  return {
    ...right,
    positionSeconds: durationSeconds > 0 ? Math.min(furthestPosition, durationSeconds) : furthestPosition,
    durationSeconds,
    completed: left.completed || right.completed,
    bestQuizScore: maxNullableScore(left.bestQuizScore, right.bestQuizScore),
  };
}

function maxNullableScore(left: number | null, right: number | null): number | null {
  return left === null ? right : right === null ? left : Math.max(left, right);
}

function capturePlayerPosition(
  player: { currentTime: number; duration: number },
  position: { current: number },
  duration: { current: number },
  completed: { current: boolean },
  playbackTouched: { current: boolean },
): void {
  const currentTime = player.currentTime;
  if (!Number.isFinite(currentTime) || currentTime < 0) return;
  if (Math.abs(currentTime - position.current) > 0.1) playbackTouched.current = true;
  position.current = currentTime;
  if (Number.isFinite(player.duration) && player.duration > 0) duration.current = player.duration;
  completed.current = completed.current || (duration.current > 0 && currentTime / duration.current >= 0.9);
}

function needsServerSync(merged: VideoProgress | null, server: VideoProgress | null): boolean {
  if (!merged) return false;
  if (!server) return merged.positionSeconds > 0 || merged.completed || merged.bestQuizScore !== null;
  return merged.positionSeconds !== server.positionSeconds
    || merged.durationSeconds !== server.durationSeconds
    || merged.completed !== server.completed
    || merged.bestQuizScore !== server.bestQuizScore;
}

function mergeMonotonicProgress(
  value: VideoProgress,
  completed: { current: boolean },
  bestQuizScore: { current: number | null },
  setProgress: (update: (current: VideoProgress | null) => VideoProgress | null) => void,
): void {
  completed.current = completed.current || value.completed;
  bestQuizScore.current = bestQuizScore.current === null ? value.bestQuizScore
    : value.bestQuizScore === null ? bestQuizScore.current : Math.max(bestQuizScore.current, value.bestQuizScore);
  setProgress((current) => current ? { ...current, completed: completed.current, bestQuizScore: bestQuizScore.current } : value);
}

function isPlayableVideoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.pathname.toLowerCase().endsWith('.mp4');
  } catch { return false; }
}

const styles = StyleSheet.create({
  videoFrame: { width: '100%', aspectRatio: 16 / 9, position: 'relative' },
  video: { width: '100%', aspectRatio: 16 / 9, borderRadius: radii.lg, overflow: 'hidden' },
  restoreOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', gap: 8 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 9 }, meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  progressCard: { padding: 16, borderWidth: 1, borderRadius: radii.lg, gap: 10 }, rowBetween: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' }, fill: { height: 8, borderRadius: 4 }, quiz: { gap: 18 }, question: { gap: 10 },
  option: { minHeight: 52, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  optionCopy: { flex: 1 }, disabled: { opacity: 0.55 },
  notice: { padding: 14, borderRadius: radii.md, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
});
