import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAppUpdate } from './updates';

/** Checks for an app update on launch and whenever the app comes back to the front (quietly, at most every few hours). */
export function useUpdateChecks(): void {
  useEffect(() => {
    void useAppUpdate.getState().check({ quiet: true });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void useAppUpdate.getState().check({ quiet: true });
    });
    return () => sub.remove();
  }, []);
}
