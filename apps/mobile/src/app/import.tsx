import { router } from 'expo-router';
import { ImportScreen } from '@/features/import/ImportScreen';

export default function ImportRoute() {
  return (
    <ImportScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
    />
  );
}
