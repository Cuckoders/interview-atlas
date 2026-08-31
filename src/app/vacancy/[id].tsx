import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';

import { DetailLayout, MissingDetail } from '@/components/detail-layout';
import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { PrimaryButton } from '@/components/ui/primary-button';
import { vacancies } from '@/data/mock-data';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useVacancyDetail } from '@/hooks/use-vacancy-detail';
import { useSavedVacancyStatuses } from '@/hooks/use-saved-vacancy-statuses';
import { useAppStore } from '@/store/use-app-store';
import { radii } from '@/theme/palette';
import { formatTimestamp } from '@/utils/date';

export function generateStaticParams() {
  return vacancies.map(({ id }) => ({ id }));
}

export default function VacancyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const router = useRouter();
  const { vacancy, loading } = useVacancyDetail(id);
  const statuses = useSavedVacancyStatuses();
  const savedVacancyIds = useAppStore((state) => state.savedVacancyIds);
  const toggleVacancySaved = useAppStore((state) => state.toggleVacancySaved);

  if (loading) return <DetailLayout><ActivityIndicator color={colors.accent} /></DetailLayout>;
  if (!vacancy) return <MissingDetail title="Вакансия не найдена" />;
  const saved = savedVacancyIds.includes(vacancy.id);
  const savedStatus = statuses.items.find((item) => item.vacancyId === vacancy.id);
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
      {savedStatus && savedStatus.status !== 'active' ? (
        <View style={[styles.statusNotice, { backgroundColor: colors.warmSoft }]}>
          <Ionicons name={savedStatus.status === 'changed' ? 'create-outline' : 'close-circle-outline'} size={22} color={colors.warning} />
          <View style={{ flex: 1, gap: 4 }}><AppText variant="label" style={{ color: colors.warning }}>
            {savedStatus.status === 'changed' ? 'Работодатель изменил вакансию' : 'Вакансия закрыта или снята'}</AppText>
            <AppText variant="caption" color="secondary">{savedStatus.status === 'changed'
              ? `Изменено: ${savedStatus.changedFields.join(', ')}. Проверьте новые условия.`
              : 'Сохранён последний известный снимок и ссылка на источник.'}</AppText></View>
        </View>
      ) : null}
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
      {savedStatus?.status === 'changed' ? <PrimaryButton label="Изменения просмотрены" icon="checkmark-outline"
        onPress={() => { void statuses.acknowledge(vacancy.id); }} secondary /> : null}
      {savedStatus?.status !== 'closed' ? <PrimaryButton label="Проверить совпадение и пробелы" icon="analytics-outline"
        onPress={() => router.push({ pathname: '/vacancy-match/[id]', params: { id: vacancy.id } } as Href)} secondary /> : null}
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
  statusNotice: { padding: 15, borderRadius: radii.md, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
});
