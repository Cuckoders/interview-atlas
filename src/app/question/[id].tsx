import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { DetailLayout, MissingDetail } from '@/components/detail-layout';
import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { PrimaryButton } from '@/components/ui/primary-button';
import { questions } from '@/data/mock-data';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppStore } from '@/store/use-app-store';
import { radii } from '@/theme/palette';
import { formatTimestamp } from '@/utils/date';

export function generateStaticParams() {
  return questions.map(({ id }) => ({ id }));
}

export default function QuestionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const question = questions.find((item) => item.id === id);
  const savedQuestionIds = useAppStore((state) => state.savedQuestionIds);
  const toggleQuestionSaved = useAppStore((state) => state.toggleQuestionSaved);
  const toggleSaved = useCallback(() => {
    if (!question) return;
    toggleQuestionSaved(question.id);
    void Haptics.selectionAsync();
  }, [question, toggleQuestionSaved]);

  if (!question) return <MissingDetail title="Вопрос не найден" />;
  const saved = savedQuestionIds.includes(question.id);

  return (
    <DetailLayout>
      <View style={styles.meta}>
        <Chip label={question.specialty} />
        <Chip label={question.difficulty} />
      </View>
      <AppText variant="display">{question.title}</AppText>
      <View style={[styles.quick, { backgroundColor: colors.accentSoft }]}>
        <View style={styles.quickTitle}>
          <Ionicons name="flash-outline" size={20} color={colors.accent} />
          <AppText variant="label" color="accent">
            Короткий ответ
          </AppText>
        </View>
        <AppText>{question.shortAnswer}</AppText>
      </View>
      <View style={styles.section}>
        <AppText variant="subtitle">Развёрнутый ответ</AppText>
        <AppText color="secondary">{question.fullAnswer}</AppText>
      </View>
      <View style={styles.section}>
        <AppText variant="subtitle">Теги</AppText>
        <View style={styles.meta}>
          {question.tags.map((tag) => (
            <Chip key={tag} label={tag} />
          ))}
        </View>
      </View>
      <View style={[styles.source, { borderColor: colors.border }]}>
        <Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />
        <View style={{ flex: 1 }}>
          <AppText variant="caption">{question.sourceLabel}</AppText>
          <AppText variant="caption" color="muted">
            Обновлено {formatTimestamp(question.updatedAt)}
          </AppText>
        </View>
      </View>
      <PrimaryButton
        label={saved ? 'Убрать из сохранённых' : 'Сохранить вопрос'}
        icon={saved ? 'bookmark' : 'bookmark-outline'}
        onPress={toggleSaved}
        secondary={saved}
      />
    </DetailLayout>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quick: { padding: 18, borderRadius: radii.lg, gap: 10 },
  quickTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  section: { gap: 9 },
  source: { padding: 16, borderWidth: 1, borderRadius: radii.md, flexDirection: 'row', gap: 10 },
});
