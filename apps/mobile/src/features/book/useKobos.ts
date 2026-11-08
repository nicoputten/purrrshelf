import type { ItemKobos, KoboState } from '@purrshelf/contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/session/session';

export const kobosKey = (itemId: string) => ['library', itemId, 'kobos'] as const;

export function useKobos(itemId: string) {
  const call = useSession((s) => s.call);
  return useQuery({ queryKey: kobosKey(itemId), queryFn: () => call('itemKobos', { itemId }) });
}

export type KoboAction = 'send' | 'remove';

/** What the Kobo shows right after the tap, before the broker answers. */
export function optimisticState(action: KoboAction, state: KoboState): KoboState {
  if (action === 'send') return state === 'removing' ? 'on_device' : 'sending';
  return state === 'on_device' ? 'removing' : 'not_on_device';
}

/**
 * Send to or remove from one reader's Kobo (APP-06). The row changes at
 * once and goes back if the broker refuses.
 */
export function useKoboChange(itemId: string) {
  const call = useSession((s) => s.call);
  const client = useQueryClient();
  const key = kobosKey(itemId);
  return useMutation({
    mutationFn: ({ action, userId }: { action: KoboAction; userId: string }) =>
      call(action === 'send' ? 'sendToKobo' : 'removeFromKobo', { itemId, userId }),
    onMutate: async ({ action, userId }) => {
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueryData<ItemKobos>(key);
      if (before) {
        client.setQueryData<ItemKobos>(key, {
          kobos: before.kobos.map((k) =>
            k.userId === userId ? { ...k, state: optimisticState(action, k.state) } : k,
          ),
        });
      }
      return { before };
    },
    onError: (_err, _vars, context) => {
      if (context?.before) client.setQueryData(key, context.before);
    },
    onSuccess: (kobos) => {
      client.setQueryData(key, kobos);
      // Owners and "on your Kobo" on book and search pages change with it.
      void client.invalidateQueries({ queryKey: ['work'] });
      void client.invalidateQueries({ queryKey: ['discover'] });
      void client.invalidateQueries({ queryKey: ['library', 'books'] });
    },
  });
}
