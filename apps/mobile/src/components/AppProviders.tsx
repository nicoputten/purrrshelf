import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { i18n, resolveLanguage } from '@/i18n';
import { usePreferences } from '@/session/preferences';
import { ThemeProvider } from '@/theme/ThemeProvider';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
  });
}

/** Keeps i18next in step with the language preference. */
function LanguageSync() {
  const language = usePreferences((s) => s.language);
  useEffect(() => {
    void i18n.changeLanguage(resolveLanguage(language));
  }, [language]);
  return null;
}

export function AppProviders({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient?: QueryClient;
}) {
  const [client] = useState(() => queryClient ?? makeQueryClient());
  return (
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <LanguageSync />
        <ThemeProvider>{children}</ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>
  );
}
