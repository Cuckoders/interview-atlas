import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SpecialtyPicker } from '@/components/specialty-picker';
import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { PrimaryButton } from '@/components/ui/primary-button';
import { useAppTheme } from '@/hooks/use-app-theme';
import { createSavedSearch, deleteSavedSearch, fetchSavedSearches, updateSavedSearch } from '@/services/vacancy-intelligence-api';
import { cacheSearches, readCachedSearches } from '@/services/vacancy-intelligence-cache';
import { checkVacancyAlerts, requestVacancyAlertPermission } from '@/services/vacancy-alerts';
import { useSessionStore } from '@/store/use-session-store';
import { radii } from '@/theme/palette';
import type { Specialty } from '@/types/domain';
import type { AlertIntervalHours, SavedVacancySearch, SavedVacancySearchInput } from '@/types/vacancy-intelligence';

const specialties: Specialty[] = ['Frontend', 'Backend', 'Mobile', 'QA'];

export default function VacancySearchesScreen() {
  const params = useLocalSearchParams<{ query?: string; specialty?: string }>();
  const router = useRouter();
  const { colors } = useAppTheme();
  const sessionStatus = useSessionStore((state) => state.status);
  const user = useSessionStore((state) => state.user);
  const initialSpecialty = specialties.includes(params.specialty as Specialty) ? params.specialty as Specialty : 'Frontend';
  const [items, setItems] = useState<SavedVacancySearch[]>([]);
  const [name, setName] = useState(params.query ? `Поиск: ${params.query}` : 'Подходящие вакансии');
  const [query, setQuery] = useState(params.query ?? '');
  const [specialty, setSpecialty] = useState<Specialty>(initialSpecialty);
  const [notifications, setNotifications] = useState(false);
  const [intervalHours, setIntervalHours] = useState<AlertIntervalHours>(24);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const cached = await readCachedSearches(user.id);
    if (cached) setItems(cached);
    try {
      const live = await fetchSavedSearches(); setItems(live); setError(null);
      await cacheSearches(user.id, live);
    } catch { setError('Не удалось обновить поиски. Показана последняя сохранённая версия.'); }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);

  const toggleNotifications = useCallback(async () => {
    if (notifications) { setNotifications(false); return; }
    const granted = await requestVacancyAlertPermission();
    setNotifications(granted);
    if (!granted) setMessage('Уведомления не включены. Поиск всё равно можно сохранить и открывать вручную.');
  }, [notifications]);
  const create = useCallback(async () => {
    if (!user || !name.trim()) return;
    setSaving(true); setMessage(null);
    const input: SavedVacancySearchInput = {
      name: name.trim(), specialty, notificationsEnabled: notifications, intervalHours,
      ...(query.trim() ? { query: query.trim() } : {}),
    };
    try {
      const created = await createSavedSearch(input);
      const next = [created, ...items]; setItems(next); await cacheSearches(user.id, next);
      setQuery(''); setName('Подходящие вакансии'); setNotifications(false);
      setMessage('Поиск сохранён. Новые результаты не будут повторяться в уведомлениях.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { setError('Не удалось сохранить поиск. Проверьте соединение и повторите.'); }
    finally { setSaving(false); }
  }, [intervalHours, items, name, notifications, query, specialty, user]);
  const remove = useCallback((item: SavedVacancySearch) => {
    Alert.alert('Удалить сохранённый поиск?', `«${item.name}» и его история уведомлений будут удалены.`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => { void (async () => {
        if (!user) return;
        try { await deleteSavedSearch(item.id); const next = items.filter((value) => value.id !== item.id);
          setItems(next); await cacheSearches(user.id, next); }
        catch { setError('Не удалось удалить поиск.'); }
      })(); } },
    ]);
  }, [items, user]);
  const toggleItem = useCallback(async (item: SavedVacancySearch) => {
    if (!user) return;
    const enabled = item.notificationsEnabled ? false : await requestVacancyAlertPermission();
    const input = toInput(item, enabled);
    try {
      const updated = await updateSavedSearch(item.id, input);
      const next = items.map((value) => value.id === item.id ? updated : value);
      setItems(next); await cacheSearches(user.id, next);
    } catch { setError('Не удалось изменить уведомления.'); }
  }, [items, user]);
  const checkNow = useCallback(async () => {
    setChecking(true); setMessage(null);
    try {
      const result = await checkVacancyAlerts(true);
      setMessage(result === null ? 'Разрешите уведомления в настройках устройства, чтобы выполнить проверку.'
        : result.totalNew ? `Найдено новых вакансий: ${result.totalNew}. Уведомление отправлено.` : 'Новых вакансий по этим поискам пока нет.');
      await load();
    } catch { setError('Не удалось проверить новые вакансии.'); }
    finally { setChecking(false); }
  }, [load]);

  const renderItem = useCallback(({ item }: { item: SavedVacancySearch }) => (
    <View style={styles.itemWrap}><SavedSearchCard item={item} onToggle={() => void toggleItem(item)} onDelete={() => remove(item)} /></View>
  ), [remove, toggleItem]);
  const keyExtractor = useCallback((item: SavedVacancySearch) => item.id, []);
  const header = useMemo(() => (
    <View>
      <ScreenHeader eyebrow="Вакансии" title="Сохранённые поиски" subtitle="Сервер запоминает уже показанные вакансии и присылает один сгруппированный сигнал по выбранному интервалу." />
      <View style={[styles.form, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <AppText variant="subtitle">Новый поиск</AppText>
        <Field label="Название" value={name} onChangeText={setName} placeholder="Например, React remote" />
        <Field label="Слова в вакансии" value={query} onChangeText={setQuery} placeholder="React, PostgreSQL, QA…" />
        <AppText variant="label">Направление</AppText>
        <View style={styles.pickerShift}><SpecialtyPicker value={specialty} onChange={(value) => { if (value !== 'Все') setSpecialty(value); }} /></View>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: notifications }} onPress={() => void toggleNotifications()}
          style={({ pressed }) => [styles.toggle, { borderColor: colors.border }, pressed && styles.pressed]}>
          <Ionicons name={notifications ? 'notifications' : 'notifications-off-outline'} size={22} color={notifications ? colors.accent : colors.textMuted} />
          <View style={styles.toggleCopy}><AppText variant="label">Уведомлять о новых</AppText><AppText variant="caption" color="muted">Разрешение запрашивается только при включении.</AppText></View>
          <Chip label={notifications ? 'Включено' : 'Выключено'} selected={notifications} />
        </Pressable>
        <AppText variant="label">Не чаще</AppText>
        <View style={styles.chips}>{([6, 24, 168] as AlertIntervalHours[]).map((hours) => <Chip key={hours}
          label={hours === 6 ? '6 часов' : hours === 24 ? 'Раз в день' : 'Раз в неделю'} selected={intervalHours === hours} onPress={() => setIntervalHours(hours)} />)}</View>
        <PrimaryButton label="Сохранить поиск" icon="bookmark-outline" loading={saving} onPress={create} />
      </View>
      <View style={styles.actions}><PrimaryButton label="Проверить сейчас" icon="refresh-outline" secondary loading={checking} onPress={checkNow} /></View>
      {message ? <Notice text={message} positive /> : null}{error ? <Notice text={error} /> : null}
      <View style={styles.listTitle}><AppText variant="subtitle">Ваши поиски</AppText><AppText variant="caption" color="muted">{items.length}/10</AppText></View>
    </View>
  ), [checking, colors.accent, colors.border, colors.surface, colors.textMuted, create, error, intervalHours, items.length, message, name, notifications, query, saving, specialty, toggleNotifications, checkNow]);

  if (sessionStatus === 'restoring') return <Screen><ActivityIndicator style={styles.loader} color={colors.accent} /></Screen>;
  if (!user) return <Screen><View style={styles.signedOut}><Ionicons name="person-circle-outline" size={42} color={colors.accent} />
    <AppText variant="title">Нужен аккаунт</AppText><AppText color="secondary">Поиски и история уведомлений синхронизируются между устройствами.</AppText>
    <PrimaryButton label="Открыть аккаунт" onPress={() => router.push('/(tabs)/account')} /></View></Screen>;

  return <Screen><FlatList data={items} renderItem={renderItem} keyExtractor={keyExtractor} ListHeaderComponent={header}
    ListEmptyComponent={loading ? <ActivityIndicator style={styles.loader} color={colors.accent} /> : <View style={styles.empty}><AppText color="secondary">Сохранённых поисков пока нет.</AppText></View>}
    contentContainerStyle={styles.list} ItemSeparatorComponent={SearchSeparator}
    keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} initialNumToRender={10} /></Screen>;
}

function SavedSearchCard({ item, onToggle, onDelete }: { item: SavedVacancySearch; onToggle: () => void; onDelete: () => void }) {
  const { colors } = useAppTheme();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={styles.rowBetween}><View style={styles.cardCopy}><AppText variant="subtitle">{item.name}</AppText><AppText variant="caption" color="secondary">
      {[item.query, item.specialty, item.workFormat].filter(Boolean).join(' · ')}</AppText></View>
      <Ionicons name={item.notificationsEnabled ? 'notifications' : 'notifications-off-outline'} size={22} color={item.notificationsEnabled ? colors.accent : colors.textMuted} /></View>
    <AppText variant="caption" color="muted">{item.lastCheckedAt ? `Проверено ${new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(item.lastCheckedAt))}` : 'Ещё не проверялся'}</AppText>
    <View style={styles.cardActions}><Pressable accessibilityRole="button" onPress={onToggle} style={styles.smallButton}><AppText variant="label" color="accent">{item.notificationsEnabled ? 'Приостановить' : 'Включить'}</AppText></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Удалить поиск ${item.name}`} onPress={onDelete} style={styles.iconAction}><Ionicons name="trash-outline" size={21} color={colors.warning} /></Pressable></View>
  </View>;
}
function Field({ label, ...props }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string }) {
  const { colors } = useAppTheme();
  return <View style={styles.field}><AppText variant="label">{label}</AppText><TextInput {...props} accessibilityLabel={label} placeholderTextColor={colors.textMuted}
    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} /></View>;
}
function Notice({ text, positive = false }: { text: string; positive?: boolean }) {
  const { colors } = useAppTheme();
  return <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: positive ? colors.accentSoft : colors.warmSoft }]}><Ionicons name={positive ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={20} color={positive ? colors.success : colors.warning} /><AppText variant="caption" style={{ flex: 1, color: positive ? colors.success : colors.warning }}>{text}</AppText></View>;
}
function toInput(item: SavedVacancySearch, notificationsEnabled: boolean): SavedVacancySearchInput {
  return { name: item.name, notificationsEnabled, intervalHours: item.intervalHours,
    ...(item.query ? { query: item.query } : {}), ...(item.specialty ? { specialty: item.specialty } : {}),
    ...(item.workFormat ? { workFormat: item.workFormat } : {}) };
}
function SearchSeparator() { return <View style={{ paddingVertical: 6 }} />; }

const styles = StyleSheet.create({
  list: { paddingBottom: 80 }, form: { marginHorizontal: 20, padding: 16, borderWidth: 1, borderRadius: radii.lg, gap: 14 },
  field: { gap: 7 }, input: { minHeight: 52, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: 14, fontSize: 16 },
  pickerShift: { marginHorizontal: -20 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toggle: { minHeight: 68, padding: 10, borderWidth: 1, borderRadius: radii.md, flexDirection: 'row', alignItems: 'center', gap: 9 },
  toggleCopy: { flex: 1, gap: 2 }, actions: { padding: 20 }, notice: { marginHorizontal: 20, marginBottom: 12, padding: 14, borderRadius: radii.md, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  listTitle: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemWrap: { paddingHorizontal: 20 }, card: { padding: 16, borderWidth: 1, borderRadius: radii.lg, gap: 11 },
  rowBetween: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }, cardCopy: { flex: 1, gap: 4 },
  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  smallButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 }, iconAction: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  loader: { padding: 40 }, empty: { paddingHorizontal: 20, paddingVertical: 28 }, signedOut: { padding: 24, gap: 14 }, pressed: { opacity: 0.72 },
});
