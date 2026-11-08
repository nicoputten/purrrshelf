import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { UpdateSection } from '@/features/updates/UpdateSection';
import {
  usePreferences,
  type LanguagePreference,
  type ThemePreference,
} from '@/session/preferences';
import { useSession } from '@/session/session';

export function useMe() {
  const call = useSession((s) => s.call);
  return useQuery({ queryKey: ['me'], queryFn: () => call('me') });
}

export interface SettingsScreenProps {
  /** Opens the library import (BRK-09). */
  onImport: () => void;
}

export function SettingsScreen({ onImport }: SettingsScreenProps) {
  const { t } = useTranslation();
  const { theme, language, setTheme, setLanguage } = usePreferences();
  const serverUrl = useSession((s) => s.serverUrl);
  const logout = useSession((s) => s.logout);
  const me = useMe();

  return (
    <Screen>
      <AppText variant="title" accessibilityRole="header">
        {t('settings.title')}
      </AppText>

      <View style={styles.section}>
        <AppText variant="label">{t('settings.language')}</AppText>
        <Segmented<LanguagePreference>
          label={t('settings.language')}
          value={language}
          onChange={(v) => void setLanguage(v)}
          options={[
            { value: 'system', label: t('settings.followPhone') },
            { value: 'en', label: t('settings.english') },
            { value: 'nl', label: t('settings.dutch') },
          ]}
        />
      </View>

      <View style={styles.section}>
        <AppText variant="label">{t('settings.theme')}</AppText>
        <Segmented<ThemePreference>
          label={t('settings.theme')}
          value={theme}
          onChange={(v) => void setTheme(v)}
          options={[
            { value: 'system', label: t('settings.followPhone') },
            { value: 'dark', label: t('settings.dark') },
            { value: 'light', label: t('settings.light') },
          ]}
        />
      </View>

      <View style={styles.section}>
        <AppText variant="label">{t('settings.library')}</AppText>
        <Button variant="outline" label={t('settings.importLibrary')} onPress={onImport} />
      </View>

      <UpdateSection />

      <View style={styles.section}>
        <AppText variant="label">{t('settings.account')}</AppText>
        {me.data ? (
          <AppText>{t('settings.loggedInAs', { name: me.data.displayName })}</AppText>
        ) : null}
        {serverUrl ? (
          <AppText variant="muted">{t('settings.server', { server: serverUrl })}</AppText>
        ) : null}
        <Button variant="outline" label={t('settings.logout')} onPress={() => void logout()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
});
