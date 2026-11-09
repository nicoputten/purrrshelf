import { useActivity } from './useActivity';
import { ActivityPill } from './ActivityPill';
import { RequestsSheet } from './RequestsSheet';
import { useRequestEvents } from '@/features/requests/useRequestEvents';
import { useRequests } from '@/features/requests/useRequests';

/**
 * The activity pill and the Requests sheet over every tab (APP-14). Follows
 * my requests live; the pill steps aside while the sheet is open, so Swat
 * plays in the sheet's row then.
 */
export function ActivityHost() {
  useRequestEvents();
  const requests = useRequests();
  const sheetOpen = useActivity((s) => s.sheetOpen);
  const list = (requests.data?.requests ?? []).filter((r) => r.status !== 'cancelled');
  return (
    <>
      {sheetOpen ? null : <ActivityPill requests={list} />}
      <RequestsSheet requests={list} />
    </>
  );
}
