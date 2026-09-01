import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { QuestionCard } from '@/components/cards/question-card';
import { TrackCard } from '@/components/cards/track-card';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionTitle } from '@/components/section-title';
import { SpecialtyPicker } from '@/components/specialty-picker';
import { AppText } from '@/components/ui/app-text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useLearningFeed } from '@/hooks/use-learning-feed';
import { useAppStore } from '@/store/use-app-store';
import { radii } from '@/theme/palette';
import type { InterviewQuestion, LearningTrack, Specialty, VideoLesson } from '@/types/domain';

export default function LearnScreen() {
  const { colors } = useAppTheme();
  const specialty = useAppStore((state) => state.specialty);
  const setSpecialty = useAppStore((state) => state.setSpecialty);
  const savedQuestionIds = useAppStore((state) => state.savedQuestionIds);
  const toggleQuestionSaved = useAppStore((state) => state.toggleQuestionSaved);

  const questionFeed = useLearningFeed('question', specialty);
  const trackFeed = useLearningFeed('track', specialty);
  const videoFeed = useLearningFeed('video', specialty);
  const refreshQuestions = questionFeed.refresh;
  const refreshTracks = trackFeed.refresh;
  const refreshVideos = videoFeed.refresh;
  const filteredQuestions = questionFeed.items;
  const refresh = useCallback(() => {
    refreshQuestions(); refreshTracks(); refreshVideos();
  }, [refreshQuestions, refreshTracks, refreshVideos]);
  const refreshing = questionFeed.refreshing || trackFeed.refreshing || videoFeed.refreshing;
  const contentError = questionFeed.error ?? trackFeed.error ?? videoFeed.error;
  const contentStale = questionFeed.stale || trackFeed.stale || videoFeed.stale;

  const selectSpecialty = useCallback(
    (value: Specialty | 'Все') => {
      if (value !== 'Все') {
        setSpecialty(value);
        void Haptics.selectionAsync();
      }
    },
    [setSpecialty],
  );

  const renderQuestion = useCallback(
    ({ item }: { item: InterviewQuestion }) => (
      <View style={styles.itemContainer}>
        <QuestionCard
          question={item}
          saved={savedQuestionIds.includes(item.id)}
          onToggleSaved={toggleQuestionSaved}
        />
      </View>
    ),
    [savedQuestionIds, toggleQuestionSaved],
  );
  const keyExtractor = useCallback((item: InterviewQuestion) => item.id, []);

  const header = (
    <>
      <ScreenHeader
        eyebrow="База знаний"
        title="Учиться системно"
        subtitle="Треки, вопросы и короткие видео с датой последнего обновления."
      />
      <SpecialtyPicker value={specialty} onChange={selectSpecialty} />
      <View style={[styles.notice, { backgroundColor: contentStale || contentError ? colors.warmSoft : colors.accentSoft }]}>
        <Ionicons name={contentStale || contentError ? 'time-outline' : 'cloud-done-outline'} size={18} color={contentStale || contentError ? colors.warning : colors.success} />
        <AppText variant="caption" style={{ flex: 1, color: contentStale || contentError ? colors.warning : colors.success }}>
          {contentError ?? (contentStale ? 'Локальные материалы; потяните список, чтобы обновить.' : 'Опубликованный контент синхронизирован с CMS.')}
        </AppText>
      </View>
      <View style={styles.headerBody}>
        <SectionTitle title="Учебные треки" detail={`${trackFeed.items.length}`} />
      </View>
      <TrackCarousel items={trackFeed.items} />
      <View style={styles.headerBody}>
        <SectionTitle title="Видеоразборы" detail="до 25 минут" />
      </View>
      <VideoCarousel items={videoFeed.items} />
      <View style={[styles.headerBody, styles.questionTitle]}>
        <SectionTitle title={`Вопросы · ${specialty}`} detail={`${filteredQuestions.length}`} />
      </View>
    </>
  );

  return (
    <Screen>
      <FlatList
        data={filteredQuestions}
        renderItem={renderQuestion}
        keyExtractor={keyExtractor}
        ListHeaderComponent={header}
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={EmptyQuestions}
        ListFooterComponent={questionFeed.loading ? <ActivityIndicator style={styles.loader} color={colors.accent} /> : null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} colors={[colors.accent]} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={5}
        windowSize={5}
      />
    </Screen>
  );
}

function TrackCarousel({ items }: { items: LearningTrack[] }) {
  const renderItem = useCallback(({ item }: { item: LearningTrack }) => <TrackCard track={item} />, []);
  const keyExtractor = useCallback((item: LearningTrack) => item.id, []);
  return (
    <FlatList
      horizontal
      data={items}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      contentContainerStyle={styles.carousel}
      showsHorizontalScrollIndicator={false}
      removeClippedSubviews
      initialNumToRender={3}
      windowSize={3}
    />
  );
}

function VideoCarousel({ items }: { items: VideoLesson[] }) {
  const renderItem = useCallback(({ item }: { item: VideoLesson }) => <VideoCard video={item} />, []);
  const keyExtractor = useCallback((item: VideoLesson) => item.id, []);
  return (
    <FlatList
      horizontal
      data={items}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      contentContainerStyle={styles.carousel}
      showsHorizontalScrollIndicator={false}
    />
  );
}

function VideoCard({ video }: { video: VideoLesson }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`Открыть видео: ${video.title}`}
      onPress={() => router.push({ pathname: '/video/[id]', params: { id: video.id } } as Href)}
      android_ripple={{ color: colors.overlay }}
      style={({ pressed }) => [styles.video, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
      <View style={[styles.play, { backgroundColor: colors.warmSoft }]}>
        <Ionicons name="play" size={22} color={colors.warm} />
      </View>
      <AppText variant="label" numberOfLines={2}>
        {video.title}
      </AppText>
      <AppText variant="caption" color="muted">
        {video.durationMinutes} мин · {video.specialty}
      </AppText>
    </Pressable>
  );
}

function EmptyQuestions() {
  return (
    <View style={styles.empty}>
      <AppText variant="subtitle">Раздел пополняется</AppText>
      <AppText color="secondary">Новые вопросы появятся после редакционной проверки.</AppText>
    </View>
  );
}

function Separator() {
  return <View style={{ height: 6 * 2 }} />;
}

const styles = StyleSheet.create({
  list: { paddingBottom: 112 },
  itemContainer: { paddingHorizontal: 20 },
  headerBody: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10 },
  notice: { marginHorizontal: 20, marginBottom: 8, padding: 13, borderRadius: radii.md, flexDirection: 'row', gap: 9, alignItems: 'center' },
  questionTitle: { paddingTop: 26 },
  carousel: { paddingHorizontal: 20, gap: 12 },
  video: { width: 50 * 4, minHeight: 138, padding: 16, borderWidth: 1, borderRadius: radii.lg, gap: 10 },
  play: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  empty: { marginHorizontal: 20, paddingVertical: 32, gap: 8 },
  loader: { paddingVertical: 24 },
  pressed: { opacity: 0.72 },
});
