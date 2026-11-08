import type { ItemOwnership } from '@purrshelf/contract';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/session/session';

export type OwnershipAction = 'keep' | 'remove';

/**
 * Adds a library book to my library or removes it (BRK-08). Removing also
 * takes it off my Kobo; a book nobody owns is deleted after 7 days.
 */
export function useOwnershipChange(itemId: string) {
  const call = useSession((s) => s.call);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (action: OwnershipAction): Promise<ItemOwnership> =>
      call(action === 'keep' ? 'keepBook' : 'removeBook', { itemId }),
    onSuccess: () => {
      // Owners, Kobo rows and the Mine list all change with it.
      void client.invalidateQueries({ queryKey: ['work'] });
      void client.invalidateQueries({ queryKey: ['discover'] });
      void client.invalidateQueries({ queryKey: ['library'] });
    },
  });
}
