import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAppUpdate } from './updates';

async function checkAndPrepare(): Promise<void> {
  await useAppUpdate.getState().check({ quiet: true });
  await useAppUpdate.getState().prepare();
}

/**
 * Checks for an app update on launch and whenever the app comes back to the
 * front (quietly, at most every few hours). With automatic updates on and
 * Android willing to install without asking, the update is downloaded right
 * away and installed when the app is left (APP-11).
 */
export function useUpdateChecks(): void {
  useEffect(() => {
    void checkAndPrepare();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkAndPrepare();
      if (state === 'background') void useAppUpdate.getState().installQuietly();
    });
    return () => sub.remove();
  }, []);
}
