import { router, useLocalSearchParams } from 'expo-router';
import { ReleasePickerScreen } from '@/features/requests/ReleasePicker';

export default function ReleasePickerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <ReleasePickerScreen
      requestId={id}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/requests'))}
    />
  );
}
