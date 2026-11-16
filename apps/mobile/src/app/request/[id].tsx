import { router, useLocalSearchParams } from 'expo-router';
import { ReleasePickerScreen } from '@/features/requests/ReleasePicker';

export default function ReleasePickerRoute() {
  const { id, words, indexer } = useLocalSearchParams<{
    id: string;
    words?: string;
    indexer?: string;
  }>();
  return (
    <ReleasePickerScreen
      requestId={id}
      // Results of the reader's own words (APP-18): "Pick the right one".
      mine={words && indexer ? { words, indexer } : null}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/requests'))}
      onSearchMyself={() => router.push({ pathname: '/request-search/[id]', params: { id } })}
    />
  );
}
