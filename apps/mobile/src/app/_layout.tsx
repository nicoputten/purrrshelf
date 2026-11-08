import { Fredoka_500Medium, Fredoka_600SemiBold } from '@expo-google-fonts/fredoka';
import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold } from '@expo-google-fonts/nunito';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppProviders } from '@/components/AppProviders';
import { AddSheetHost } from '@/features/add/AddSheet';
import { usePreferences } from '@/session/preferences';
import { useSession } from '@/session/session';
import { useTheme } from '@/theme/ThemeProvider';

void SplashScreen.preventAutoHideAsync();

function RootStack() {
  const status = useSession((s) => s.status);
  const { scheme, colors } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      >
        <Stack.Protected guard={status === 'needsServer'}>
          <Stack.Screen name="server" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'needsLogin'}>
          <Stack.Screen name="login" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'ready'}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="book/[id]" />
        </Stack.Protected>
      </Stack>
      {status === 'ready' ? <AddSheetHost onAdded={() => router.navigate('/requests')} /> : null}
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });
  const status = useSession((s) => s.status);

  useEffect(() => {
    void Promise.all([usePreferences.getState().load(), useSession.getState().bootstrap()]);
  }, []);

  const ready = fontsLoaded && status !== 'loading';
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  return (
    <AppProviders>
      <RootStack />
    </AppProviders>
  );
}
