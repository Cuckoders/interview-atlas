import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii } from '@/theme/palette';
import type { LearningTrack } from '@/types/domain';

function TrackCardComponent({ track }: { track: LearningTrack }) {
  const { colors } = useAppTheme();
  const percent = Math.round(track.progress * 100);
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <AppText variant="caption" color="accent">
        {track.specialty}
      </AppText>
      <AppText variant="subtitle">{track.title}</AppText>
      <AppText color="secondary" numberOfLines={2}>
        {track.description}
      </AppText>
      <View style={[styles.track, { backgroundColor: colors.surfaceRaised }]}>
        <View style={[styles.fill, { backgroundColor: colors.accent, width: `${Math.max(percent, 3)}%` }]} />
      </View>
      <View style={styles.footer}>
        <AppText variant="caption" color="muted">
          {track.lessons} уроков · {Math.round(track.durationMinutes / 60)} ч
        </AppText>
        <AppText variant="caption" color="accent">
          {percent}%
        </AppText>
      </View>
    </View>
  );
}

export const TrackCard = memo(TrackCardComponent);

const styles = StyleSheet.create({
  card: { width: 56 * 5, padding: 18, borderWidth: 1, borderRadius: radii.lg, gap: 10 },
  track: { height: 7, borderRadius: 4, overflow: 'hidden', marginTop: 4 },
  fill: { height: '100%', borderRadius: 4 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
