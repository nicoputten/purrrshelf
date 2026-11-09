import { router, useLocalSearchParams } from 'expo-router';
import { useActivity } from '@/features/activity/useActivity';
import { Top10Screen } from '@/features/top10/Top10Screen';
import { isChipGenre } from '@/features/top10/useCharts';

/** The Top 10 tab (APP-15); the budget pill opens the Requests sheet (APP-14). */
export default function Top10Route() {
  const openRequests = useActivity((s) => s.openSheet);
  const { genre } = useLocalSearchParams<{ genre?: string }>();
  return (
    <Top10Screen
      {...(isChipGenre(genre) ? { genre } : {})}
      onOpen={(id) => router.push({ pathname: '/book/[id]', params: { id } })}
      onSearch={(q) => router.navigate({ pathname: '/', params: { q } })}
      onOpenRequests={openRequests}
    />
  );
}
