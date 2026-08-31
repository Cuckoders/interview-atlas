import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { VacancyCard } from '@/components/cards/vacancy-card';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SpecialtyPicker } from '@/components/specialty-picker';
import { AppText } from '@/components/ui/app-text';
import { vacancies } from '@/data/mock-data';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppStore } from '@/store/use-app-store';
import { radii } from '@/theme/palette';
import type { Specialty, Vacancy } from '@/types/domain';

export default function JobsScreen() {
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const [specialty, setSpecialty] = useState<Specialty | 'Все'>('Все');
  const [savedOnly, setSavedOnly] = useState(false);
  const savedVacancyIds = useAppStore((state) => state.savedVacancyIds);
  const toggleVacancySaved = useAppStore((state) => state.toggleVacancySaved);

  const data = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru');
    return vacancies.filter((item) => {
      const matchesSpecialty = specialty === 'Все' || item.specialty === specialty;
      const matchesSaved = !savedOnly || savedVacancyIds.includes(item.id);
      const haystack = `${item.title} ${item.company} ${item.skills.join(' ')}`.toLocaleLowerCase('ru');
      return matchesSpecialty && matchesSaved && (!normalized || haystack.includes(normalized));
    });
  }, [query, savedOnly, savedVacancyIds, specialty]);

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
        />
      </View>
    ),
    [savedVacancyIds, toggleVacancySaved],
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
      <View style={[styles.notice, { backgroundColor: colors.warmSoft }]}>
        <Ionicons name="shield-checkmark-outline" size={19} color={colors.warning} />
        <AppText variant="caption" style={{ flex: 1, color: colors.warning }}>
          Сейчас показаны демо-данные. Боевой сбор работает только через разрешённые API и
          сохраняет ссылку на источник.
        </AppText>
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
        ListEmptyComponent={EmptyVacancies}
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
  empty: { paddingHorizontal: 20, paddingVertical: 36, gap: 8 },
  pressed: { opacity: 0.72 },
});
