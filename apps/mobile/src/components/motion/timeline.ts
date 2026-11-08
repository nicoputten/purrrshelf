import { withDelay, withSequence, withTiming, Easing } from 'react-native-reanimated';

/** One keyframe: reach `to` at `at` ms after the start. */
export type Key = readonly [at: number, to: number];

const ease = Easing.inOut(Easing.quad);

/**
 * Turns absolute keyframes into a Reanimated animation that starts from the
 * value at time 0, so a scene reads like the CSS keyframes on the boards.
 */
export function keyframes(keys: readonly Key[], start = 0) {
  const steps = [];
  let time = 0;
  let wait = 0;
  let value = start;
  for (const [at, to] of keys) {
    const duration = Math.max(0, at - time);
    if (to === value) {
      wait += duration;
    } else {
      const step = withTiming(to, { duration, easing: ease });
      steps.push(wait > 0 ? withDelay(wait, step) : step);
      wait = 0;
    }
    time = at;
    value = to;
  }
  const [first, ...rest] = steps;
  if (first === undefined) return start;
  return rest.length === 0 ? first : withSequence(first, ...rest);
}
