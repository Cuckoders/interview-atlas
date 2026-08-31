import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { AppText } from '@/components/ui/app-text';
import { PrimaryButton } from '@/components/ui/primary-button';
import { useAppTheme } from '@/hooks/use-app-theme';
import { synchronizeProgress } from '@/services/cloud-sync';
import { exportAccountData, removeAccount, signIn, signOut, signUp } from '@/services/session-actions';
import { useSessionStore } from '@/store/use-session-store';
import { radii } from '@/theme/palette';
import { formatTimestamp } from '@/utils/date';
import { type Href, useRouter } from 'expo-router';

type Mode = 'login' | 'register';

export default function AccountScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const status = useSessionStore((state) => state.status);
  const user = useSessionStore((state) => state.user);
  const syncStatus = useSessionStore((state) => state.syncStatus);
  const lastSyncAt = useSessionStore((state) => state.lastSyncAt);
  const syncError = useSessionStore((state) => state.error);
  const [mode, setMode] = useState<Mode>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try { await operation(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось выполнить действие'); }
    finally { setBusy(false); }
  };

  const submit = () => run(async () => {
    if (mode === 'register') await signUp(displayName, email, password);
    else await signIn(email, password);
    setPassword('');
  });

  const exportData = () => run(async () => {
    const data = await exportAccountData();
    await Share.share({ title: 'Экспорт Interview Atlas', message: JSON.stringify(data, null, 2) });
  });

  const deleteProfile = () => run(async () => {
    await removeAccount(deletePassword);
    setDeletePassword('');
    setShowDelete(false);
  });

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <ScreenHeader
            eyebrow="ПРОФИЛЬ"
            title="Аккаунт"
            subtitle="Сохраняйте прогресс и продолжайте подготовку на другом устройстве."
          />

          {status === 'restoring' || busy ? (
            <View style={styles.loading} accessibilityRole="progressbar">
              <ActivityIndicator color={colors.accent} />
              <AppText color="secondary">{busy ? 'Выполняем действие…' : 'Восстанавливаем сессию…'}</AppText>
            </View>
          ) : user ? (
            <View style={styles.body}>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name="person" size={28} color={colors.accent} />
                </View>
                <View style={styles.grow}>
                  <AppText variant="subtitle">{user.displayName}</AppText>
                  <AppText color="secondary">{user.email}</AppText>
                </View>
              </View>

              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name={syncIcon(syncStatus)} size={24} color={syncStatus === 'error' ? colors.warning : colors.accent} />
                <View style={styles.grow}>
                  <AppText variant="label">{syncLabel(syncStatus)}</AppText>
                  <AppText variant="caption" color="secondary">
                    {syncError ?? (lastSyncAt ? `Обновлено ${formatTimestamp(lastSyncAt)}` : 'Первичная синхронизация')}
                  </AppText>
                </View>
              </View>

              <PrimaryButton label="Открыть план подготовки" icon="calendar-outline" onPress={() => router.push('/preparation' as Href)} />
              <PrimaryButton label="Синхронизировать сейчас" icon="cloud-upload-outline" secondary onPress={() => void run(synchronizeProgress)} />
              <PrimaryButton label="Экспортировать мои данные" icon="download-outline" secondary onPress={() => void exportData()} />
              <PrimaryButton label="Выйти" icon="log-out-outline" secondary onPress={() => void run(async () => {
                await signOut();
                setMode('login');
              })} />

              {showDelete ? (
                <View style={[styles.dangerCard, { backgroundColor: colors.warmSoft }]}>
                  <AppText variant="label" style={{ color: colors.warning }}>Удаление необратимо</AppText>
                  <AppText variant="caption" color="secondary">Введите пароль — аккаунт, сессии и облачный прогресс будут удалены.</AppText>
                  <Field value={deletePassword} onChangeText={setDeletePassword} placeholder="Текущий пароль" secure />
                  <PrimaryButton label="Удалить аккаунт" icon="trash-outline" onPress={() => void deleteProfile()} />
                </View>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => setShowDelete(true)} style={styles.deleteLink}>
                  <AppText variant="label" style={{ color: colors.warning }}>Удалить аккаунт</AppText>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.body}>
              <View style={[styles.segment, { backgroundColor: colors.surfaceRaised }]}>
                {(['login', 'register'] as const).map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: mode === value }}
                    onPress={() => { setMode(value); setMessage(null); }}
                    style={[styles.segmentButton, mode === value && { backgroundColor: colors.surface }]}>
                    <AppText variant="label" color={mode === value ? 'accent' : 'secondary'}>
                      {value === 'login' ? 'Войти' : 'Регистрация'}
                    </AppText>
                  </Pressable>
                ))}
              </View>
              {mode === 'register' ? <Field value={displayName} onChangeText={setDisplayName} placeholder="Имя" autoComplete="name" /> : null}
              <Field value={email} onChangeText={setEmail} placeholder="Email" autoComplete="email" keyboardType="email-address" />
              <Field value={password} onChangeText={setPassword} placeholder="Пароль — минимум 10 символов" secure autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              {message ? <AppText accessibilityRole="alert" style={{ color: colors.warning }}>{message}</AppText> : null}
              <PrimaryButton label={mode === 'login' ? 'Войти' : 'Создать аккаунт'} icon="arrow-forward" onPress={() => void submit()} />
              <AppText variant="caption" color="muted">
                На iOS и Android refresh-сессия хранится в Keychain/Keystore. В web-preview сессия действует только до перезагрузки вкладки.
              </AppText>
            </View>
          )}
          {message && user ? <AppText accessibilityRole="alert" style={{ color: colors.warning }}>{message}</AppText> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

type FieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secure?: boolean;
  autoComplete?: 'name' | 'email' | 'current-password' | 'new-password';
  keyboardType?: 'default' | 'email-address';
};

function Field({ value, onChangeText, placeholder, secure, autoComplete, keyboardType = 'default' }: FieldProps) {
  const { colors } = useAppTheme();
  return (
    <TextInput
      accessibilityLabel={placeholder}
      autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
      autoComplete={autoComplete}
      autoCorrect={false}
      keyboardType={keyboardType}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      secureTextEntry={secure}
      value={value}
      style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
    />
  );
}

function syncLabel(status: 'idle' | 'syncing' | 'offline' | 'error') {
  return { idle: 'Прогресс синхронизирован', syncing: 'Синхронизируем…', offline: 'Ожидаем сеть', error: 'Ошибка синхронизации' }[status];
}

function syncIcon(status: 'idle' | 'syncing' | 'offline' | 'error'): keyof typeof Ionicons.glyphMap {
  return { idle: 'cloud-done-outline', syncing: 'sync-outline', offline: 'cloud-offline-outline', error: 'warning-outline' }[status] as keyof typeof Ionicons.glyphMap;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 120 },
  body: { paddingHorizontal: 20, gap: 14 },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 12 },
  card: { minHeight: 84, borderWidth: 1, borderRadius: radii.md, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, gap: 3 },
  segment: { flexDirection: 'row', borderRadius: radii.md, padding: 4 },
  segmentButton: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 52, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: 16, fontSize: 16 },
  dangerCard: { borderRadius: radii.md, padding: 16, gap: 12 },
  deleteLink: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
