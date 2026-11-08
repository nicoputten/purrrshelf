import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Logo } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { useMe } from './settings/SettingsScreen';

/** Search (home) placeholder until APP-02. */
export function HomeScreen() {
  const { t } = useTranslation();
  const me = useMe();
  return (
    <Screen>
      <Logo />
      <AppText variant="display" accessibilityRole="header">
        {t('home.heading')}
      </AppText>
      {me.data ? <AppText>{t('home.hello', { name: me.data.displayName })}</AppText> : null}
      <AppText variant="muted">{t('home.placeholder')}</AppText>
    </Screen>
  );
}

export function ComingSoonScreen({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <Screen>
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      <AppText variant="muted">{t('common.comingSoon')}</AppText>
    </Screen>
  );
}
