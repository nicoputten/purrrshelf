import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { BookCover } from '@/components/BookCover';
import { motion } from '@/theme/tokens';
import { haptic } from './haptics';
import { PawPrint } from './PawPrint';
import { useMotionMode } from './useMotion';

/** Delivered timeline in ms (board 9, item 4). */
export const DELIVERED = { burst: 420, confetti: 900, end: 1800, collapse: 260 } as const;
/** Reduced motion: how long the end frame stays before it collapses. */
export const DELIVERED_STILL_MS = 1200;
const HEIGHT = 170;

/** Where each paw-print ends up, relative to the centre of the e-reader. */
const CONFETTI = [
  { x: -80, y: -58, color: motion.ginger },
  { x: 82, y: -62, color: motion.pink },
  { x: -88, y: 34, color: motion.mint },
  { x: 90, y: 28, color: motion.ginger },
] as const;

/** Reduced motion: the cover already on the e-reader. */
const IN_PLACE = { opacity: 1, transform: [{ translateY: 0 }, { rotate: '0deg' }] };

interface DeliveredProps {
  workId: string;
  title: string;
  /** Called once the scene has played and collapsed. */
  onDone: () => void;
}

/**
 * "Delivered": plays once when a push to a Kobo is confirmed. The cover drops
 * into an e-reader with a spring and paw-print confetti bursts out.
 */
export function Delivered({ workId, title, onDone }: DeliveredProps) {
  const { t } = useTranslation();
  const { reduced } = useMotionMode();
  const drop = useSharedValue(0);
  const burst = useSharedValue(0);
  const open = useSharedValue(1);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    if (reduced) {
      at(0, haptic.success);
      at(DELIVERED_STILL_MS, onDone);
    } else {
      drop.value = withSpring(1, { damping: 11, stiffness: 140, mass: 0.8 });
      burst.value = withDelay(
        DELIVERED.burst,
        withTiming(1, { duration: DELIVERED.confetti, easing: Easing.out(Easing.quad) }),
      );
      at(DELIVERED.burst, haptic.success);
      at(DELIVERED.end, () => {
        open.value = withTiming(0, { duration: DELIVERED.collapse });
      });
      at(DELIVERED.end + DELIVERED.collapse, onDone);
    }
    return () => timers.forEach(clearTimeout);
    // Plays once per mount; a new push mounts a new Delivered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const frame = useAnimatedStyle(() => ({ height: HEIGHT * open.value, opacity: open.value }));
  const cover = useAnimatedStyle(() => ({
    opacity: interpolate(drop.value, [0, 0.35], [0, 1], 'clamp'),
    transform: [
      { translateY: interpolate(drop.value, [0, 1], [-150, 0]) },
      { rotate: `${interpolate(drop.value, [0, 1], [-8, 0])}deg` },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      accessible
      accessibilityLabel={t('motion.delivered')}
      style={[styles.frame, frame]}
      testID="delivered"
    >
      <View style={styles.reader}>
        <View style={styles.screen}>
          <Animated.View style={reduced ? IN_PLACE : cover} testID="delivered-cover">
            <BookCover workId={workId} title={title} width={56} height={84} size="s" />
          </Animated.View>
        </View>
        {reduced
          ? null
          : CONFETTI.map((c, i) => <Confetti key={i} burst={burst} {...c} index={i} />)}
      </View>
    </Animated.View>
  );
}

function Confetti({
  burst,
  x,
  y,
  color,
  index,
}: {
  burst: SharedValue<number>;
  x: number;
  y: number;
  color: string;
  index: number;
}) {
  const style = useAnimatedStyle(() => {
    const p = burst.value;
    return {
      opacity: interpolate(p, [0, 0.3, 1], [0, 1, 0]),
      transform: [
        { translateX: x * p },
        { translateY: y * p },
        { scale: interpolate(p, [0, 0.3, 1], [0.3, 1, 0.8]) },
      ],
    };
  });
  return (
    <Animated.View style={[styles.confetti, style]} testID={`confetti-${index}`}>
      <PawPrint color={color} size={18} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  reader: {
    width: 110,
    height: 150,
    borderRadius: 14,
    backgroundColor: motion.reader,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screen: {
    width: 88,
    height: 120,
    borderRadius: 6,
    backgroundColor: motion.readerScreen,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confetti: { position: 'absolute', left: 46, top: 66 },
});
