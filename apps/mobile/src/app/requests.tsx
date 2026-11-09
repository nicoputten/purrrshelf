import { router } from 'expo-router';
import { RequestsScreen } from '@/features/requests/RequestsScreen';

/** The full list of my requests, from "See all requests" or the Library (APP-14). */
export default function RequestsRoute() {
  return (
    <RequestsScreen
      onBack={() => router.back()}
      onPick={(id) => router.push({ pathname: '/request/[id]', params: { id } })}
      onFindBook={() => router.navigate('/')}
    />
  );
}
