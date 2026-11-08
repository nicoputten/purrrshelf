import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';
import { fonts, motion } from '@/theme/tokens';
import { haptic } from './haptics';
import { keyframes } from './timeline';
import { useMotionMode } from './useMotion';

/** The scene on board 9b is drawn on a 576 × 300 stage. */
const STAGE_W = 576;
const STAGE_H = 300;

/** Swat timeline in ms (board 9b, squeezed to about 1.6 s). */
export const SWAT = {
  tap1: 220,
  tap2: 400,
  swat: 680,
  land: 980,
  badge: 1080,
  end: 1600,
  collapse: 260,
} as const;
/** Reduced motion: how long the end frame stays before the card collapses. */
export const SWAT_STILL_MS = 1200;

const ARM = keyframes([
  [120, 0],
  [SWAT.tap1, 52],
  [320, 0],
  [SWAT.tap2, 48],
  [480, 0],
  [580, -12],
  [SWAT.swat, 76],
  [880, 0],
]);
const BOOK_ROT = [
  [190, 0],
  [SWAT.tap1, 7],
  [300, 0],
  [370, 0],
  [SWAT.tap2, -7],
  [480, 0],
  [SWAT.swat, 0],
  [740, 14],
  [860, 55],
  [SWAT.land, 92],
  [1060, 88],
  [1140, 90],
] as const;
const BOOK_X = [
  [SWAT.swat, 0],
  [740, 34],
  [860, 96],
  [SWAT.land, 134],
] as const;
const BOOK_Y = [
  [SWAT.swat, 0],
  [740, -6],
  [860, 30],
  [SWAT.land, 112],
  [1060, 104],
  [1140, 110],
] as const;
const BASKET = [
  [SWAT.land, 1],
  [1040, 0.86],
  [1120, 1.04],
  [1200, 1],
] as const;
const BADGE = [
  [SWAT.badge, 0],
  [1180, 1.15],
  [1280, 1],
] as const;
const EYES = [
  [600, 0],
  [700, 2],
  [1100, 2],
  [1300, 0],
] as const;

/** Reduced motion: the last frame of the scene. */
const BOOK_IN_BASKET = {
  transform: [{ translateX: 134 }, { translateY: 110 }, { rotate: '90deg' }],
};
const SHOWN = { opacity: 1, transform: [{ scale: 1 }] };

interface SwatProps {
  /** Book title written on the little book. */
  title: string;
  /** Called once the scene has played and collapsed. */
  onDone: () => void;
}

/**
 * "Swat" (boards 9b, 9c): plays once when a release is grabbed, inside the
 * request card under the title, then collapses so the step list shows.
 * Decorative and never blocks touches.
 */
export function Swat({ title, onDone }: SwatProps) {
  const { t } = useTranslation();
  const { reduced, loop } = useMotionMode();
  const [width, setWidth] = useState(318);
  const scale = width / STAGE_W;

  const arm = useSharedValue(0);
  const rot = useSharedValue(0);
  const bx = useSharedValue(0);
  const by = useSharedValue(0);
  const basket = useSharedValue(1);
  const badge = useSharedValue(0);
  const eyes = useSharedValue(0);
  const tail = useSharedValue(0);
  const open = useSharedValue(1);

  // The one-shot itself: runs once on mount.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    if (reduced) {
      at(SWAT.land, haptic.land);
      at(SWAT_STILL_MS, onDone);
    } else {
      arm.value = ARM;
      rot.value = keyframes(BOOK_ROT);
      bx.value = keyframes(BOOK_X);
      by.value = keyframes(BOOK_Y);
      basket.value = keyframes(BASKET, 1);
      badge.value = keyframes(BADGE);
      eyes.value = keyframes(EYES);
      at(SWAT.tap1, haptic.tap);
      at(SWAT.tap2, haptic.tap);
      at(SWAT.land, haptic.land);
      at(SWAT.end, () => {
        open.value = withTiming(0, { duration: SWAT.collapse, easing: Easing.in(Easing.quad) });
      });
      at(SWAT.end + SWAT.collapse, onDone);
    }
    return () => timers.forEach(clearTimeout);
    // Plays once per mount; a new grab mounts a new Swat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tail swish loop while the scene is up.
  useEffect(() => {
    if (!loop) {
      cancelAnimation(tail);
      return;
    }
    tail.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(tail);
  }, [loop, tail]);

  const frame = useAnimatedStyle(() => ({
    height: (width * STAGE_H * open.value) / STAGE_W,
    opacity: open.value,
  }));
  const armStyle = useAnimatedStyle(() => ({ transform: [{ translateX: arm.value }] }));
  const bookStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: bx.value }, { translateY: by.value }, { rotate: `${rot.value}deg` }],
  }));
  const basketStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: basket.value }] }));
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, badge.value),
    transform: [{ scale: interpolate(badge.value, [0, 1], [0.4, 1], 'extend') }],
  }));
  const tailStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(tail.value, [0, 1], [-14, 16])}deg` }],
  }));
  const eyesStyle = useAnimatedStyle(() => ({ transform: [{ translateX: eyes.value }] }));

  return (
    <Animated.View
      pointerEvents="none"
      accessible
      accessibilityLabel={t('motion.swat')}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - width) > 1) setWidth(w);
      }}
      style={[styles.frame, frame]}
      testID="swat"
    >
      <View style={[styles.stage, { transform: [{ scale }], transformOrigin: 'left top' }]}>
        <View style={styles.table} />
        <View style={[styles.leg, { left: 50 }]} />
        <View style={[styles.leg, { left: 300 }]} />

        <Animated.View style={[styles.arm, armStyle]}>
          <View style={[styles.toe, { top: 4 }]} />
          <View style={[styles.toe, { top: 10 }]} />
        </Animated.View>

        <Animated.View style={[styles.tail, { transformOrigin: 'right bottom' }, tailStyle]}>
          <Svg width={44} height={40} viewBox="0 0 44 40">
            <Path
              d="M42 38Q14 38 10 14Q9 6 4 4"
              fill="none"
              stroke={motion.ginger}
              strokeWidth={7}
              strokeLinecap="round"
            />
          </Svg>
        </Animated.View>
        <View style={styles.cat}>
          <Svg width={120} height={84} viewBox="0 0 120 84">
            <Path d="M10 82Q8 34 60 34Q112 34 110 82Z" fill={motion.ginger} />
            <Path d="M26 48L31 20L48 38Z" fill={motion.ginger} />
            <Path d="M94 48L89 20L72 38Z" fill={motion.ginger} />
            <Path d="M31 40L33 29L40 37Z" fill={motion.pink} />
            <Path d="M89 40L87 29L80 37Z" fill={motion.pink} />
            <Path d="M58 64L64 64L61 67Z" fill={motion.nose} />
          </Svg>
          <Animated.View style={[StyleSheet.absoluteFill, eyesStyle]}>
            <Svg width={120} height={84} viewBox="0 0 120 84">
              <G>
                <Ellipse cx={50} cy={56} rx={4} ry={5} fill={motion.eye} />
                <Ellipse cx={72} cy={56} rx={4} ry={5} fill={motion.eye} />
                <Circle cx={51.5} cy={54} r={1.4} fill={motion.cream} />
                <Circle cx={73.5} cy={54} r={1.4} fill={motion.cream} />
              </G>
            </Svg>
          </Animated.View>
        </View>

        <View style={[styles.basket, { transformOrigin: 'bottom' }]}>
          <Animated.View style={[styles.basketBody, basketStyle]}>
            <View style={styles.weave} />
            <View style={styles.weave} />
            <View style={styles.weave} />
          </Animated.View>
        </View>

        <Animated.View
          style={[styles.book, reduced ? BOOK_IN_BASKET : bookStyle]}
          testID="swat-book"
        >
          <Text numberOfLines={4} style={styles.bookTitle}>
            {title}
          </Text>
        </Animated.View>
        <View style={styles.rim} />

        <Animated.View style={[styles.badge, reduced ? SHOWN : badgeStyle]} testID="swat-badge">
          <Text style={styles.badgeText}>{t('motion.gotIt')}</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', borderRadius: 16, backgroundColor: motion.stage },
  stage: { position: 'absolute', left: 0, top: 0, width: STAGE_W, height: STAGE_H },
  table: {
    position: 'absolute',
    left: 30,
    top: 170,
    width: 300,
    height: 12,
    borderRadius: 6,
    backgroundColor: motion.table,
  },
  leg: { position: 'absolute', top: 182, width: 8, height: 118, backgroundColor: motion.tableLeg },
  arm: {
    position: 'absolute',
    left: 106,
    top: 150,
    width: 66,
    height: 18,
    borderRadius: 9,
    backgroundColor: motion.ginger,
  },
  toe: {
    position: 'absolute',
    right: 4,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: motion.pink,
  },
  tail: { position: 'absolute', left: 12, top: 126, width: 44, height: 40 },
  cat: { position: 'absolute', left: 32, top: 88, width: 120, height: 84 },
  book: {
    position: 'absolute',
    left: 230,
    top: 92,
    width: 52,
    height: 78,
    borderRadius: 6,
    backgroundColor: '#3F4A5B',
    borderLeftWidth: 6,
    borderLeftColor: '#33405A',
    justifyContent: 'flex-end',
    padding: 5,
  },
  bookTitle: { fontFamily: fonts.heading, fontSize: 9, lineHeight: 10, color: motion.cream },
  basket: { position: 'absolute', left: 330, top: 232, width: 124, height: 56 },
  basketBody: {
    flex: 1,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    backgroundColor: motion.basket,
    justifyContent: 'space-evenly',
    paddingHorizontal: 10,
    transformOrigin: 'bottom',
  },
  weave: { height: 4, borderRadius: 2, backgroundColor: motion.basketWeave },
  rim: {
    position: 'absolute',
    left: 326,
    top: 226,
    width: 132,
    height: 10,
    borderRadius: 5,
    backgroundColor: motion.basketRim,
  },
  badge: {
    position: 'absolute',
    left: 430,
    top: 176,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: motion.ginger,
  },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 14, color: motion.badgeText },
});
