import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { Linking, StyleSheet, View } from 'react-native';

import { DetailLayout, MissingDetail } from '@/components/detail-layout';
import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { PrimaryButton } from '@/components/ui/primary-button';
import { vacancies } from '@/data/mock-data';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppStore } from '@/store/use-app-store';
import { radii } from '@/theme/palette';
import { formatTimestamp } from '@/utils/date';

export function generateStaticParams() {
  return vacancies.map(({ id }) => ({ id }));
}

export default function VacancyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const vacancy = vacancies.find((item) => item.id === id);
  const savedVacancyIds = useAppStore((state) => state.savedVacancyIds);
  const toggleVacancySaved = useAppStore((state) => state.toggleVacancySaved);

  if (!vacancy) return <MissingDetail title="Вакансия не найдена" />;
  const saved = savedVacancyIds.includes(vacancy.id);
  const toggleSaved = () => {
    toggleVacancySaved(vacancy.id);
    void Haptics.selectionAsync();
  };
  const openSource = () => {
    void Linking.openURL(vacancy.sourceUrl);
  };

  return (
    <DetailLayout>
      <View style={styles.sourceRow}>
        <View style={[styles.sourceDot, { backgroundColor: colors.warm }]} />
        <AppText variant="caption" color="muted">
          {vacancy.source} · опубликовано {formatTimestamp(vacancy.publishedAt)}
        </AppText>
      </View>
      <View style={styles.heading}>
        <AppText variant="display">{vacancy.title}</AppText>
        <AppText variant="subtitle" color="secondary">
          {vacancy.company}
        </AppText>
      </View>
      {vacancy.salary ? (
        <View style={[styles.salary, { backgroundColor: colors.accentSoft }]}>
          <AppText variant="title" color="accent">
            {vacancy.salary}
          </AppText>
        </View>
      ) : null}
      <View style={styles.meta}>
        <Chip label={vacancy.workFormat} />
        <Chip label={vacancy.level} />
        <Chip label={vacancy.location} />
      </View>
      <View style={styles.section}>
        <AppText variant="subtitle">О роли</AppText>
        <AppText color="secondary">{vacancy.description}</AppText>
      </View>
      <View style={styles.section}>
        <AppText variant="subtitle">Ключевые навыки</AppText>
        <View style={styles.meta}>
          {vacancy.skills.map((skill) => (
            <Chip key={skill} label={skill} />
          ))}
        </View>
      </View>
      <View style={[styles.provenance, { borderColor: colors.border }]}>
        <Ionicons name="shield-checkmark-outline" size={22} color={colors.success} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label">Источник сохранён</AppText>
          <AppText variant="caption" color="muted">
            Собрано {formatTimestamp(vacancy.collectedAt)}. Условия сверяйте на странице работодателя.
          </AppText>
        </View>
      </View>
      <PrimaryButton label="Открыть у источника" icon="open-outline" onPress={openSource} />
      <PrimaryButton
        label={saved ? 'Убрать из сохранённых' : 'Сохранить вакансию'}
        icon={saved ? 'bookmark' : 'bookmark-outline'}
        onPress={toggleSaved}
        secondary
      />
    </DetailLayout>
  );
}

const styles = StyleSheet.create({
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sourceDot: { width: 8, height: 8, borderRadius: 4 },
  heading: { gap: 6 },
  salary: { padding: 18, borderRadius: radii.lg },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  section: { gap: 10 },
  provenance: { padding: 16, borderWidth: 1, borderRadius: radii.md, flexDirection: 'row', gap: 11 },
});
