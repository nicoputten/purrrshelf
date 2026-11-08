import { useState, type ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Button } from '@/components/Button';
import { motion } from '@/theme/tokens';
import { useMotionMode } from './useMotion';

/** How long the ears stay up after a press (board 9, item 6). */
export const EARS_UP_MS = 1200;
const HIDDEN = 16;

type EarsButtonProps = ComponentProps<typeof Button> & {
  /** Play the ears on press (default). Off for a press that isn't worth a cheer, e.g. Remove. */
  celebrate?: boolean;
};

/**
 * "Ears up": a primary button that squishes on press while two ears spring up
 * from behind it and a small heart floats up. The press goes through at once;
 * the animation never delays it.
 */
export function EarsButton({ celebrate = true, ...props }: EarsButtonProps) {
  const { reduced } = useMotionMode();
  const [width, setWidth] = useState(0);
  const press = useSharedValue(1);
  const ears = useSharedValue(HIDDEN);
  const heart = useSharedValue(0);

  const onPress = () => {
    props.onPress();
    if (reduced || !celebrate) return;
    press.value = withSequence(
      withTiming(0.9, { duration: 70 }),
      withSpring(1, { damping: 8, stiffness: 260 }),
    );
    ears.value = withSequence(
      withSpring(0, { damping: 7, stiffness: 220 }),
      withDelay(EARS_UP_MS, withTiming(HIDDEN, { duration: 220 })),
    );
    heart.value = 0;
    heart.value = withTiming(1, { duration: 1300 });
  };

  const button = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  // Ears fade as they sink, so they never show through an outlined button.
  const earStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - ears.value / HIDDEN),
    transform: [{ translateY: ears.value }],
  }));
  const heartStyle = useAnimatedStyle(() => {
    const p = heart.value;
    return {
      opacity: p === 0 ? 0 : p < 0.25 ? p * 4 : Math.max(0, 1 - (p - 0.25) / 0.75),
      transform: [{ translateY: -48 * p }, { scale: 0.6 + Math.min(0.6, p * 2) }],
    };
  });

  const ear = Math.min(32, Math.max(22, width / 5));
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.wrap}>
      <Animated.View
        pointerEvents="none"
        style={[styles.ears, { paddingHorizontal: width * 0.22 }, earStyle]}
        testID="ears"
      >
        {[0, 1].map((i) => (
          <Svg key={i} width={ear} height={ear * 0.65} viewBox="0 0 28 18">
            <Path d="M0 18L14 0L28 18Z" fill={motion.ginger} />
          </Svg>
        ))}
      </Animated.View>
      <Animated.View style={button}>
        <Button {...props} variant={props.variant ?? 'primary'} onPress={onPress} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.heart, heartStyle]} testID="heart">
        <Svg width={28} height={28} viewBox="0 0 24 24">
          <Path
            d="M12 21C5 15 2 12 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 4-3 7-10 13z"
            fill={motion.pink}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  ears: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heart: { position: 'absolute', right: -6, top: 0 },
});
