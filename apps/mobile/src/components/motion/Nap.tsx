import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { fonts, motion } from '@/theme/tokens';
import { useMotionMode } from './useMotion';

/** One breath in or out (board 9, item 5). */
export const BREATH_MS = 1800;
const Z_MS = 2700;

/**
 * "Nap": a sleeping cat that breathes, with three floating Zs. Used for
 * not found, waiting for the daily budget and an empty library. Decorative:
 * the message next to it carries the meaning.
 */
export function Nap({ size = 120 }: { size?: number }) {
  const { reduced, loop } = useMotionMode();
  const breath = useSharedValue(0);
  useEffect(() => {
    if (!loop) {
      cancelAnimation(breath);
      breath.value = 0;
      return;
    }
    breath.value = withRepeat(
      withTiming(1, { duration: BREATH_MS, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(breath);
  }, [loop, breath]);
  const body = useAnimatedStyle(() => ({
    transform: [{ scaleY: interpolate(breath.value, [0, 1], [1, 1.05]) }],
  }));
  const height = (size * 84) / 120;
  return (
    <View
      style={[styles.wrap, { width: size * 1.4, height: height + size * 0.4 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="nap"
    >
      <Animated.View style={[styles.cat, { transformOrigin: 'bottom' }, body]}>
        <Svg width={size} height={height} viewBox="0 0 120 84">
          <Path d="M10 80Q8 34 60 34Q112 34 110 80Z" fill={motion.cream} />
          <Path d="M24 48L29 22L46 38Z" fill={motion.cream} />
          <Path d="M96 48L91 22L74 38Z" fill={motion.cream} />
          <Path d="M29 41L31 31L38 38Z" fill={motion.pink} />
          <Path d="M91 41L89 31L82 38Z" fill={motion.pink} />
          <Path
            d="M42 58Q48 63 54 58M66 58Q72 63 78 58"
            fill="none"
            stroke={motion.stage}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <Path d="M57 65L63 65L60 68Z" fill={motion.nose} />
        </Svg>
      </Animated.View>
      {[0, 1, 2].map((i) => (
        <Zed key={i} index={i} loop={loop} reduced={reduced} size={size} />
      ))}
    </View>
  );
}

function Zed({
  index,
  loop,
  reduced,
  size,
}: {
  index: number;
  loop: boolean;
  reduced: boolean;
  size: number;
}) {
  // Reduced motion: three still Zs climbing up and to the right.
  const still = 0.25 + index * 0.25;
  const t = useSharedValue(reduced ? still : 0);
  useEffect(() => {
    if (!loop) {
      cancelAnimation(t);
      t.value = reduced ? still : 0;
      return;
    }
    t.value = 0;
    t.value = withDelay(
      (index * Z_MS) / 3,
      withRepeat(withTiming(1, { duration: Z_MS, easing: Easing.out(Easing.ease) }), -1),
    );
    return () => cancelAnimation(t);
  }, [loop, reduced, index, still, t]);
  const k = size / 120;
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.25, 1], [0, 1, 0]),
    transform: [
      { translateX: t.value * 26 * k },
      { translateY: -t.value * 58 * k },
      { scale: interpolate(t.value, [0, 1], [0.7, 1.2]) },
    ],
  }));
  const place = { left: size * 0.86, top: size * 0.4, fontSize: 18 * k, color: motion.zzz };
  if (reduced) {
    // End state only: three still Zs climbing up and to the right.
    return (
      <Text
        style={[
          styles.z,
          place,
          {
            opacity: 1 - index * 0.25,
            transform: [{ translateX: still * 26 * k }, { translateY: -still * 58 * k }],
          },
        ]}
        testID={`z-${index}`}
      >
        z
      </Text>
    );
  }
  return (
    <Animated.Text style={[styles.z, place, style]} testID={`z-${index}`}>
      z
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', alignItems: 'center', justifyContent: 'flex-end' },
  cat: {},
  z: { position: 'absolute', fontFamily: fonts.heading },
});
