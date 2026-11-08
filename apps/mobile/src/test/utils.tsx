import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AppProviders } from '@/components/AppProviders';
import { resetOneShots } from '@/components/motion/useMotion';
import { i18n } from '@/i18n';
import { usePreferences } from '@/session/preferences';
import { setFetch, useSession } from '@/session/session';

const SecureStore = jest.requireMock('expo-secure-store') as { __store: Map<string, string> };
export const secureStore = SecureStore.__store;

/** No retries and no garbage-collection timers, so Jest can exit cleanly. */
export function testQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

export async function resetApp(): Promise<void> {
  secureStore.clear();
  resetOneShots();
  await AsyncStorage.clear();
  setFetch(undefined);
  useSession.setState({ status: 'loading', serverUrl: null, accessToken: null });
  usePreferences.setState({ theme: 'system', language: 'system', bookLanguage: null });
  await i18n.changeLanguage('en');
}

export async function renderWithProviders(ui: ReactElement) {
  const queryClient = testQueryClient();
  return render(<AppProviders queryClient={queryClient}>{ui}</AppProviders>);
}
