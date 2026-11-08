import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { motion, radius } from '@/theme/tokens';
import { useMotionMode } from './useMotion';

/** One hop of the trotting cat (board 9, item 3). */
export const BOB_MS = 220;
/** How long the cat takes to catch up with a new progress value. */
export const CATCH_UP_MS = 600;
const CAT_W = 34;
const CAT_H = 26;

/**
 * "Trot": the download progress bar with a cat running on it. The position
 * follows real progress (0-100) from the live events, never a timer.
 */
export function Trot({ progress, active = true }: { progress: number; active?: boolean }) {
  const { colors } = useTheme();
  const { reduced, loop } = useMotionMode();
  const [width, setWidth] = useState(0);
  const clamped = Math.max(0, Math.min(100, progress));
  const at = useSharedValue(clamped);
  const bob = useSharedValue(0);

  useEffect(() => {
    at.value = reduced ? clamped : withTiming(clamped, { duration: CATCH_UP_MS });
  }, [clamped, reduced, at]);

  const bobbing = loop && active;
  useEffect(() => {
    if (!bobbing) {
      cancelAnimation(bob);
      bob.value = 0;
      return;
    }
    bob.value = withRepeat(
      withTiming(1, { duration: BOB_MS, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(bob);
  }, [bobbing, bob]);

  // The cat runs from the left edge until its nose reaches the right edge.
  const fill = useAnimatedStyle(() => ({ width: `${at.value}%` }));
  const runner = useAnimatedStyle(() => ({
    transform: [{ translateX: (width * at.value) / 100 }, { translateY: -4 * bob.value }],
  }));

  return (
    <View
      style={styles.wrap}
      onLayout={(e) => setWidth(Math.max(0, e.nativeEvent.layout.width - CAT_W))}
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
      testID="trot"
    >
      <Animated.View style={[styles.runner, runner]} testID="trot-runner">
        <Svg
          width={CAT_W}
          height={CAT_H}
          viewBox="0 0 40 32"
          fill="none"
          stroke={motion.ginger}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M8 22Q8 14 16 14H26L29 9L31 14Q35 15 35 19Q35 22 31 22Z" fill={motion.ginger} />
          <Path d="M12 22V28M18 22V28M26 22V28M31 22V28" />
          <Path d="M8 18Q3 16 4 10" />
        </Svg>
      </Animated.View>
      <View style={[styles.track, { backgroundColor: colors.surfaceRaised }]}>
        <Animated.View style={[styles.fill, { backgroundColor: colors.accent }, fill]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: CAT_H + 14, justifyContent: 'flex-end', marginTop: 4 },
  runner: { position: 'absolute', left: 0, top: 0 },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radius.pill },
});
