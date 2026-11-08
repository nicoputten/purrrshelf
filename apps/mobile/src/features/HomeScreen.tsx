import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Screen } from '@/components/Screen';

/** Placeholder for tabs that later stories build (Library, Requests). */
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
