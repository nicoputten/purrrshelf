import { useTranslation } from 'react-i18next';
import { ComingSoonScreen } from '@/features/HomeScreen';

export default function Screen() {
  const { t } = useTranslation();
  return <ComingSoonScreen title={t('tabs.library')} />;
}
