import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/session/session';

export function useWork(id: string) {
  const call = useSession((s) => s.call);
  return useQuery({ queryKey: ['work', id], queryFn: () => call('work', { id }) });
}

export function useWorkSeries(id: string, enabled: boolean) {
  const call = useSession((s) => s.call);
  return useQuery({
    queryKey: ['work', id, 'series'],
    queryFn: () => call('workSeries', { id }),
    enabled,
  });
}
