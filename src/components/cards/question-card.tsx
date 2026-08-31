import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { IconButton } from '@/components/ui/icon-button';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii } from '@/theme/palette';
import type { InterviewQuestion } from '@/types/domain';
import { formatTimestamp } from '@/utils/date';

type QuestionCardProps = {
  question: InterviewQuestion;
  saved: boolean;
  onToggleSaved: (id: string) => void;
};

function QuestionCardComponent({ question, saved, onToggleSaved }: QuestionCardProps) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const open = useCallback(() => {
    router.push({ pathname: '/question/[id]', params: { id: question.id } });
  }, [question.id, router]);
  const toggleSaved = useCallback(() => onToggleSaved(question.id), [onToggleSaved, question.id]);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.topRow}>
        <View style={styles.meta}>
          <Chip label={question.specialty} />
          <AppText variant="caption" color="muted">
            {question.difficulty}
          </AppText>
        </View>
        <IconButton
          icon="bookmark-outline"
          activeIcon="bookmark"
          active={saved}
          label={saved ? 'Убрать вопрос из сохранённых' : 'Сохранить вопрос'}
          onPress={toggleSaved}
        />
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Открыть вопрос: ${question.title}`}
        android_ripple={{ color: colors.overlay }}
        onPress={open}
        style={({ pressed }) => [styles.content, pressed && styles.pressed]}>
        <AppText variant="subtitle">{question.title}</AppText>
        <AppText color="secondary" numberOfLines={2}>
          {question.shortAnswer}
        </AppText>
        <View style={styles.footer}>
          <AppText variant="caption" color="muted">
            Обновлено {formatTimestamp(question.updatedAt)}
          </AppText>
          <Ionicons name="arrow-forward" size={20} color={colors.accent} />
        </View>
      </Pressable>
    </View>
  );
}

export const QuestionCard = memo(QuestionCardComponent);

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radii.lg, overflow: 'hidden' },
  topRow: {
    minHeight: 56,
    paddingLeft: 16,
    paddingRight: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  content: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 18, gap: 10 },
  footer: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pressed: { opacity: 0.72 },
});
