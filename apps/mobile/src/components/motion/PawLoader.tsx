import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { PawPrint } from './PawPrint';
import { useMotionMode } from './useMotion';

/** One loop of the three paws (board 9, item 1). */
export const PAW_LOOP_MS = 1500;
const STAGGER_MS = 250;
const ease = Easing.inOut(Easing.ease);

interface PawLoaderProps {
  /** Paw colour; defaults to the accent. */
  color?: string;
  /** Size of one paw print. */
  size?: number;
  /** Shows "Sniffing out books…" (or this text) under the paws. */
  label?: string | boolean;
}

/** "Sniffing": three paw prints stepping in turn. Replaces every spinner. */
export function PawLoader({ color, size = 18, label }: PawLoaderProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { reduced, loop } = useMotionMode();
  const text = label === true ? t('motion.sniffing') : label || undefined;
  const paw = color ?? colors.accent;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={text ?? t('motion.loading')}
      style={styles.wrap}
      testID="paw-loader"
    >
      <View style={[styles.paws, { gap: size / 2 }]}>
        {[0, 1, 2].map((i) => (
          <Paw key={i} index={i} color={paw} size={size} reduced={reduced} loop={loop} />
        ))}
      </View>
      {text ? <AppText variant="muted">{text}</AppText> : null}
    </View>
  );
}

function Paw({
  index,
  color,
  size,
  reduced,
  loop,
}: {
  index: number;
  color: string;
  size: number;
  reduced: boolean;
  loop: boolean;
}) {
  // 0 = small and faint, 1 = full size: 30% of the loop up, 30% down, then rest.
  const step = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!loop) {
      cancelAnimation(step);
      step.value = reduced ? 1 : 0;
      return;
    }
    step.value = 0;
    step.value = withDelay(
      index * STAGGER_MS,
      withRepeat(
        withSequence(
          withTiming(1, { duration: PAW_LOOP_MS * 0.3, easing: ease }),
          withTiming(0, { duration: PAW_LOOP_MS * 0.3, easing: ease }),
          withTiming(0, { duration: PAW_LOOP_MS * 0.4 }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(step);
  }, [loop, reduced, index, step]);
  const style = usePawStyle(step);
  if (reduced) {
    // End state only: three still, full paws.
    return (
      <View style={styles.still} testID={`paw-${index}`}>
        <PawPrint color={color} size={size} />
      </View>
    );
  }
  return (
    <Animated.View style={style} testID={`paw-${index}`}>
      <PawPrint color={color} size={size} />
    </Animated.View>
  );
}

function usePawStyle(step: SharedValue<number>) {
  return useAnimatedStyle(() => ({
    opacity: interpolate(step.value, [0, 1], [0.15, 1]),
    transform: [{ scale: interpolate(step.value, [0, 1], [0.6, 1]) }],
  }));
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: space.md, minHeight: 24 },
  paws: { flexDirection: 'row', alignItems: 'center' },
  still: { opacity: 1, transform: [{ scale: 1 }] },
});
