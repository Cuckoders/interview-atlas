import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';
import { type Href, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';

import { VacancyCard } from '@/components/cards/vacancy-card';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SpecialtyPicker } from '@/components/specialty-picker';
import { AppText } from '@/components/ui/app-text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useVacancyFeed } from '@/hooks/use-vacancy-feed';
import { useSavedVacancyStatuses } from '@/hooks/use-saved-vacancy-statuses';
import { useAppStore } from '@/store/use-app-store';
import { radii } from '@/theme/palette';
import type { Specialty, Vacancy } from '@/types/domain';

export default function JobsScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [specialty, setSpecialty] = useState<Specialty | 'Все'>('Все');
  const [savedOnly, setSavedOnly] = useState(false);
  const savedVacancyIds = useAppStore((state) => state.savedVacancyIds);
  const toggleVacancySaved = useAppStore((state) => state.toggleVacancySaved);
  const feedQuery = useMemo(() => ({
    query,
    ...(specialty === 'Все' ? {} : { specialty }),
    limit: 20,
  }), [query, specialty]);
  const feed = useVacancyFeed(feedQuery);
  const savedStatuses = useSavedVacancyStatuses();
  const statusMap = useMemo(() => new Map(savedStatuses.items.map((item) => [item.vacancyId, item])), [savedStatuses.items]);

  const data = useMemo(() => {
    if (!savedOnly) return feed.items;
    const fromStatuses = savedStatuses.items.flatMap((item) => item.vacancy ? [item.vacancy] : []);
    return [...new Map([...feed.items, ...fromStatuses].filter((item) => savedVacancyIds.includes(item.id)).map((item) => [item.id, item])).values()];
  }, [feed.items, savedOnly, savedStatuses.items, savedVacancyIds]);

  const selectSpecialty = useCallback((value: Specialty | 'Все') => {
    setSpecialty(value);
    void Haptics.selectionAsync();
  }, []);
  const toggleSavedOnly = useCallback(() => {
    setSavedOnly((value) => !value);
    void Haptics.selectionAsync();
  }, []);
  const clearQuery = useCallback(() => setQuery(''), []);
  const renderItem = useCallback(
    ({ item }: { item: Vacancy }) => (
      <View style={styles.itemContainer}>
        <VacancyCard
          vacancy={item}
          saved={savedVacancyIds.includes(item.id)}
          onToggleSaved={toggleVacancySaved}
          status={statusMap.get(item.id)?.status}
        />
      </View>
    ),
    [savedVacancyIds, statusMap, toggleVacancySaved],
  );
  const keyExtractor = useCallback((item: Vacancy) => item.id, []);

  const header = (
    <>
      <ScreenHeader
        eyebrow="Агрегатор"
        title="Вакансии без шума"
        subtitle="Единая лента с источником, датой публикации и сохранёнными фильтрами."
      />
      <View style={styles.searchWrap}>
        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={21} color={colors.textMuted} />
          <TextInput
            accessibilityLabel="Поиск вакансий"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Должность, компания или навык"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            value={query}
            onChangeText={setQuery}
            style={[styles.input, { color: colors.text }]}
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Очистить поиск"
              hitSlop={8}
              onPress={clearQuery}
              style={styles.clear}>
              <Ionicons name="close-circle" size={22} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <SpecialtyPicker value={specialty} onChange={selectSpecialty} includeAll />
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: savedOnly }}
          accessibilityLabel="Показывать только сохранённые вакансии"
          android_ripple={{ color: colors.overlay }}
          onPress={toggleSavedOnly}
          style={({ pressed }) => [
            styles.savedToggle,
            {
              backgroundColor: savedOnly ? colors.accentSoft : colors.surface,
              borderColor: savedOnly ? colors.accent : colors.border,
            },
            pressed && styles.pressed,
          ]}>
          <Ionicons
            name={savedOnly ? 'bookmark' : 'bookmark-outline'}
            size={20}
            color={savedOnly ? colors.accent : colors.textSecondary}
          />
          <AppText variant="label" color={savedOnly ? 'accent' : 'secondary'}>
            Сохранённые
          </AppText>
        </Pressable>
        <AppText variant="caption" color="muted">
          Найдено: {data.length}
        </AppText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Открыть сохранённые поиски вакансий"
        android_ripple={{ color: colors.overlay }}
        onPress={() => router.push({ pathname: '/vacancy-searches', params: { query, ...(specialty === 'Все' ? {} : { specialty }) } } as Href)}
        style={({ pressed }) => [styles.smartSearch, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
        <View style={[styles.smartIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="notifications-outline" size={21} color={colors.accent} /></View>
        <View style={styles.noticeText}><AppText variant="label">Сохранить поиск и получать новые</AppText><AppText variant="caption" color="muted">Без повторов, с интервалом 6 часов, день или неделю.</AppText></View>
        <Ionicons name="chevron-forward" size={21} color={colors.accent} />
      </Pressable>
      {savedStatuses.error ? <View style={[styles.statusError, { backgroundColor: colors.warmSoft }]}><AppText variant="caption" style={{ color: colors.warning }}>{savedStatuses.error}</AppText></View> : null}
      <View style={[styles.notice, { backgroundColor: feed.error || feed.stale ? colors.warmSoft : colors.accentSoft }]}>
        <Ionicons
          name={feed.error ? 'cloud-offline-outline' : feed.stale ? 'time-outline' : 'shield-checkmark-outline'}
          size={19}
          color={feed.error || feed.stale ? colors.warning : colors.success}
        />
        <View style={styles.noticeText}>
          <AppText variant="caption" style={{ color: feed.error || feed.stale ? colors.warning : colors.success }}>
            {feed.error ?? (feed.stale
              ? 'Показан локальный кеш; обновляем данные при доступности backend.'
              : `Живая лента Arbeitnow${feed.syncedAt ? ` · синхронизировано ${formatSyncTime(feed.syncedAt)}` : ''}.`)}
          </AppText>
          {feed.error ? (
            <Pressable accessibilityRole="button" onPress={feed.refresh} hitSlop={8}>
              <AppText variant="label" color="accent">Повторить</AppText>
            </Pressable>
          ) : null}
        </View>
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
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={feed.loading
          ? <ActivityIndicator style={styles.footerLoader} color={colors.accent} />
          : <EmptyVacancies />}
        ListFooterComponent={feed.loadingMore ? <ActivityIndicator style={styles.footerLoader} color={colors.accent} /> : null}
        refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={feed.refresh} tintColor={colors.accent} colors={[colors.accent]} />}
        onEndReached={feed.hasMore ? feed.loadMore : undefined}
        onEndReachedThreshold={0.4}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={7}
        windowSize={5}
      />
    </Screen>
  );
}

function formatSyncTime(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function Separator() {
  return <View style={{ height: 6 * 2 }} />;
}

function EmptyVacancies() {
  return (
    <View style={styles.empty}>
      <AppText variant="subtitle">Ничего не найдено</AppText>
      <AppText color="secondary">Измените запрос, направление или фильтр сохранённых.</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 112 },
  itemContainer: { paddingHorizontal: 20 },
  searchWrap: { paddingHorizontal: 20, paddingBottom: 14 },
  search: {
    minHeight: 52,
    paddingLeft: 16,
    paddingRight: 6,
    borderWidth: 1,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: { flex: 1, minHeight: 48, fontSize: 16, lineHeight: 22 },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  controls: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  savedToggle: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  notice: {
    marginHorizontal: 20,
    marginBottom: 18,
    padding: 14,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  smartSearch: { marginHorizontal: 20, marginBottom: 14, minHeight: 72, padding: 12, borderWidth: 1, borderRadius: radii.md, flexDirection: 'row', alignItems: 'center', gap: 10 },
  smartIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  statusError: { marginHorizontal: 20, marginBottom: 12, padding: 12, borderRadius: radii.md },
  noticeText: { flex: 1, gap: 8 },
  footerLoader: { paddingVertical: 24 },
  empty: { paddingHorizontal: 20, paddingVertical: 36, gap: 8 },
  pressed: { opacity: 0.72 },
});
