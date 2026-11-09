import type { ItemKobos } from '@purrshelf/contract';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/session/session';
import { kobosKey } from './useKobos';

/**
 * Takes a partner's book into my library and, if asked, onto my Kobo
 * (APP-13). Uses the existing keep and send-to-Kobo endpoints (BRK-08,
 * APP-06): no indexer search, no download.
 */
export function useInstantAdd(itemId: string) {
  const call = useSession((s) => s.call);
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ sendTo }: { sendTo: string | null }) => {
      await call('keepBook', { itemId });
      if (sendTo)
        client.setQueryData<ItemKobos>(
          kobosKey(itemId),
          await call('sendToKobo', { itemId, userId: sendTo }),
        );
    },
    onSettled: () => {
      // Owners, Kobo rows, the Mine list and For you all change with it; a
      // keep that worked stays even if the Kobo send failed.
      void client.invalidateQueries({ queryKey: ['work'] });
      void client.invalidateQueries({ queryKey: ['discover'] });
      void client.invalidateQueries({ queryKey: ['library'] });
      void client.invalidateQueries({ queryKey: ['recommendations'] });
    },
  });
}
