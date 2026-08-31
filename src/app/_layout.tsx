import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { palette } from '@/theme/palette';
import { useSessionLifecycle } from '@/hooks/use-session-lifecycle';
import { usePreparationLifecycle } from '@/hooks/use-preparation-lifecycle';
import { useVacancyAlertLifecycle } from '@/hooks/use-vacancy-alert-lifecycle';

export { ErrorBoundary } from 'expo-router';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useSessionLifecycle();
  usePreparationLifecycle();
  useVacancyAlertLifecycle();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = palette[scheme];

  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  const navigationTheme = {
    ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      primary: colors.accent,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={navigationTheme}>
          <Stack
            screenOptions={{
              contentStyle: { backgroundColor: colors.background },
              headerBackButtonDisplayMode: 'default',
              headerBackTitle: 'Назад',
              headerShadowVisible: false,
              headerStyle: { backgroundColor: colors.surface },
              headerTintColor: colors.text,
            }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="question/[id]" options={{ title: 'Вопрос' }} />
            <Stack.Screen name="task/[id]" options={{ title: 'Задача' }} />
            <Stack.Screen name="vacancy/[id]" options={{ title: 'Вакансия' }} />
            <Stack.Screen name="vacancy-match/[id]" options={{ title: 'Совпадение с вакансией' }} />
            <Stack.Screen name="vacancy-searches/index" options={{ title: 'Сохранённые поиски' }} />
            <Stack.Screen name="preparation/index" options={{ title: 'План подготовки' }} />
            <Stack.Screen name="preparation/onboarding" options={{ title: 'Настройка плана', presentation: 'modal' }} />
          </Stack>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
