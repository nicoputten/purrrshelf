import { router, useLocalSearchParams } from 'expo-router';
import { SearchYourselfScreen } from '@/features/requests/SearchYourself';

export default function SearchYourselfRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SearchYourselfScreen
      requestId={id}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/requests'))}
      onResults={({ words, indexer }) =>
        router.replace({ pathname: '/request/[id]', params: { id, words, indexer } })
      }
    />
  );
}
