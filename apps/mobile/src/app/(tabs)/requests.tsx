import { router } from 'expo-router';
import { RequestsScreen } from '@/features/requests/RequestsScreen';

export default function RequestsRoute() {
  return (
    <RequestsScreen
      onPick={(id) => router.push({ pathname: '/request/[id]', params: { id } })}
      onFindBook={() => router.navigate('/')}
    />
  );
}
