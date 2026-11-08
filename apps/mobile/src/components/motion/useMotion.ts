import { useContext, useEffect, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import { NavigationContext } from 'expo-router/react-navigation';

/**
 * Whether the screen around a component is focused. Outside a navigator
 * (tests, sheets rendered on their own) it counts as focused.
 */
export function useScreenFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return;
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);
  return focused;
}

/** What a motion component may do right now (DES-02 rules). */
export interface MotionMode {
  /** The phone asks for reduced motion: render the end state only. */
  reduced: boolean;
  /** Loops may run: motion is allowed and the screen is focused. */
  loop: boolean;
}

export function useMotionMode(): MotionMode {
  const reduced = useReducedMotion();
  const focused = useScreenFocused();
  return { reduced, loop: !reduced && focused };
}

/**
 * Which event each one-shot last saw, per scope (e.g. one request). Kept in
 * memory for the app session, so leaving and coming back to a screen never
 * replays an event.
 */
const lastSeen = new Map<string, string | null>();
const played = new Set<string>();

/** Remembers an event without playing it, e.g. the state of a request the app just created. */
export function rememberEvent(scope: string, event: string | null): void {
  lastSeen.set(scope, event);
}

/** Test hook: forget every event. */
export function resetOneShots(): void {
  lastSeen.clear();
  played.clear();
}

/**
 * Decides whether a one-shot plays for `event` in `scope`, and remembers it.
 * The first event seen in a scope is only remembered (it happened before we
 * looked); a later, different, non-null event plays exactly once.
 */
export function takeOneShot(scope: string, event: string | null): boolean {
  const known = lastSeen.has(scope);
  const previous = lastSeen.get(scope);
  lastSeen.set(scope, event);
  if (!known || event === null || event === previous) return false;
  const id = `${scope}\u0000${event}`;
  if (played.has(id)) return false;
  played.add(id);
  return true;
}

/**
 * Plays a one-shot once per event: `playing` turns true when `event` changes
 * to a new value, until `done()` is called.
 */
export function useOneShot(
  scope: string,
  event: string | null,
): { playing: boolean; done: () => void } {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    // Syncs with the module-level event memory above, which lives outside React.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (takeOneShot(scope, event)) setPlaying(true);
  }, [scope, event]);
  return { playing, done: () => setPlaying(false) };
}
