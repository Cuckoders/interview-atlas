import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { IconButton } from '@/components/ui/icon-button';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii } from '@/theme/palette';
import type { Vacancy } from '@/types/domain';
import { formatTimestamp } from '@/utils/date';

type VacancyCardProps = {
  vacancy: Vacancy;
  saved: boolean;
  onToggleSaved: (id: string) => void;
};

function VacancyCardComponent({ vacancy, saved, onToggleSaved }: VacancyCardProps) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const open = useCallback(() => {
    router.push({ pathname: '/vacancy/[id]', params: { id: vacancy.id } });
  }, [router, vacancy.id]);
  const toggleSaved = useCallback(() => onToggleSaved(vacancy.id), [onToggleSaved, vacancy.id]);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.topRow}>
        <View style={styles.sourceRow}>
          <View style={[styles.sourceDot, { backgroundColor: colors.warm }]} />
          <AppText variant="caption" color="muted">
            {vacancy.source} · {formatTimestamp(vacancy.publishedAt)}
          </AppText>
        </View>
        <IconButton
          icon="bookmark-outline"
          activeIcon="bookmark"
          active={saved}
          label={saved ? 'Убрать вакансию из сохранённых' : 'Сохранить вакансию'}
          onPress={toggleSaved}
        />
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Открыть вакансию: ${vacancy.title}`}
        android_ripple={{ color: colors.overlay }}
        onPress={open}
        style={({ pressed }) => [styles.content, pressed && styles.pressed]}>
        <View style={styles.heading}>
          <AppText variant="subtitle">{vacancy.title}</AppText>
          <AppText color="secondary">{vacancy.company}</AppText>
        </View>
        {vacancy.salary ? (
          <AppText variant="label" color="accent">
            {vacancy.salary}
          </AppText>
        ) : null}
        <View style={styles.chips}>
          <Chip label={vacancy.workFormat} />
          <Chip label={vacancy.level} />
        </View>
        <View style={styles.footer}>
          <View style={styles.location}>
            <Ionicons name="location-outline" size={17} color={colors.textMuted} />
            <AppText variant="caption" color="muted">
              {vacancy.location}
            </AppText>
          </View>
          <Ionicons name="arrow-forward" size={20} color={colors.accent} />
        </View>
      </Pressable>
    </View>
  );
}

export const VacancyCard = memo(VacancyCardComponent);

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radii.lg, overflow: 'hidden' },
  topRow: {
    minHeight: 54,
    paddingLeft: 16,
    paddingRight: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sourceRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sourceDot: { width: 8, height: 8, borderRadius: 4 },
  content: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 18, gap: 12 },
  heading: { gap: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footer: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  location: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pressed: { opacity: 0.72 },
});
