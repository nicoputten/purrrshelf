import { router, useLocalSearchParams } from 'expo-router';
import { Top10Screen } from '@/features/top10/Top10Screen';
import { isChipGenre } from '@/features/top10/useCharts';

export default function Top10Route() {
  const { genre } = useLocalSearchParams<{ genre?: string }>();
  return (
    <Top10Screen
      {...(isChipGenre(genre) ? { genre } : {})}
      onOpen={(id) => router.push({ pathname: '/book/[id]', params: { id } })}
      onSearch={(q) => router.navigate({ pathname: '/', params: { q } })}
      onOpenRequests={() => router.navigate('/requests')}
    />
  );
}
