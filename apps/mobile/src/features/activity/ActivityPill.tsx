import type { BookRequest } from '@purrshelf/contract';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { AppText } from '@/components/AppText';
import { Swat, useMotionMode, useOneShot } from '@/components/motion';
import { SWAT_STILL_MS } from '@/components/motion/Swat';
import { releaseLine } from '@/features/requests/steps';
import { swatEvent, swatFresh, swatScope } from '@/features/requests/motion';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, motion, radius, space } from '@/theme/tokens';
import { pillState, type NeedStatus, type PillState, type QuietStatus } from './activity';
import { useActivity } from './useActivity';

/** Where the pill floats: just above the 72 px tab bar (board 13). */
export const PILL_BOTTOM = 82;

type Swatting = { request: BookRequest; done: () => void };

/**
 * The activity pill (APP-14, boards 13 and 9d): floats above the tab bar on
 * every tab while a request is on its way or needs the reader. Tapping it
 * opens the Requests sheet. When a release is grabbed it grows into a card
 * that plays Swat, then shrinks back.
 */
export function ActivityPill({ requests }: { requests: readonly BookRequest[] }) {
  const seen = useActivity((s) => s.seen);
  const openSheet = useActivity((s) => s.openSheet);
  const [swatting, setSwatting] = useState<Swatting | null>(null);
  const state = pillState(requests, seen);

  return (
    <>
      {requests
        .filter((r) => r.status === 'downloading')
        .map((r) => (
          <SwatWatch
            key={r.id}
            request={r}
            onSwat={(done) => setSwatting((cur) => cur ?? { request: r, done })}
          />
        ))}
      {swatting ? (
        <SwatCard
          swatting={swatting}
          onDone={() => {
            swatting.done();
            setSwatting(null);
          }}
        />
      ) : state.kind === 'hidden' ? null : (
        <Pill state={state} onPress={openSheet} />
      )}
    </>
  );
}

/** Plays Swat at most once per grab (shared with the sheet and the Requests list). */
function SwatWatch({
  request,
  onSwat,
}: {
  request: BookRequest;
  onSwat: (done: () => void) => void;
}) {
  const shot = useOneShot(swatScope(request), swatEvent(request), swatFresh(request));
  useEffect(() => {
    if (shot.playing) onSwat(shot.done);
    // Only a new play matters; onSwat changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot.playing]);
  return null;
}

function Pill({
  state,
  onPress,
}: {
  state: Exclude<PillState, { kind: 'hidden' }>;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { request, more } = state;
  const needs = state.kind === 'needsYou';
  const progress = request.status === 'downloading' ? (request.progress ?? 0) : null;
  const line = needs
    ? t('activity.needsYou', {
        title: request.title,
        reason: t(`activity.need.${request.status as NeedStatus}`),
      })
    : t('activity.fetching', { title: request.title });
  const side = needs
    ? null
    : progress !== null
      ? `${progress}%`
      : t(`activity.short.${request.status as QuietStatus}`);
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.float}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[line, side, more > 0 ? t('activity.more', { count: more }) : null]
          .filter(Boolean)
          .concat(t('activity.open'))
          .join(', ')}
        onPress={onPress}
        style={[styles.pill, { backgroundColor: needs ? colors.partnerBg : colors.surfaceRaised }]}
      >
        {needs ? null : <TrottingCat />}
        <View style={styles.body}>
          <View style={styles.row}>
            <AppText
              numberOfLines={1}
              style={[styles.title, { color: needs ? colors.partner : colors.text }]}
            >
              {line}
            </AppText>
            {side ? <AppText variant="muted">{side}</AppText> : null}
          </View>
          {progress !== null ? (
            <View style={[styles.track, { backgroundColor: colors.background }]}>
              <View
                style={[styles.bar, { width: `${progress}%`, backgroundColor: colors.accent }]}
              />
            </View>
          ) : null}
        </View>
        {more > 0 ? (
          <View style={[styles.more, { backgroundColor: colors.background }]}>
            <AppText style={[styles.moreText, { color: colors.onGingerBg }]}>+{more}</AppText>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/** The little trotting cat on an active pill (board 13); still with reduced motion. */
function TrottingCat() {
  const { loop } = useMotionMode();
  const bob = useSharedValue(0);
  useEffect(() => {
    if (!loop) return;
    bob.value = withRepeat(withTiming(-3, { duration: 220 }), -1, true);
    return () => cancelAnimation(bob);
  }, [loop, bob]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));
  return (
    <Animated.View style={style} accessibilityElementsHidden importantForAccessibility="no">
      <Svg width={30} height={24} viewBox="0 0 40 32" fill="none">
        <Path
          d="M8 22Q8 14 16 14H26L29 9L31 14Q35 15 35 19Q35 22 31 22Z"
          fill={motion.ginger}
          stroke={motion.ginger}
          strokeWidth={2.4}
          strokeLinejoin="round"
        />
        <Path
          d="M12 22V28M18 22V28M26 22V28M31 22V28M8 18Q3 16 4 10"
          stroke={motion.ginger}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}

/** Board 9d: the pill grows into a card, Swat plays (~1.6 s), then it shrinks back. */
function SwatCard({ swatting, onDone }: { swatting: Swatting; onDone: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { reduced } = useMotionMode();
  const { request } = swatting;

  // Reduced motion: a short "Got it!" in the pill only.
  useEffect(() => {
    if (!reduced) return;
    const timer = setTimeout(onDone, SWAT_STILL_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  if (reduced) {
    return (
      <View style={styles.float}>
        <View
          accessible
          accessibilityRole="alert"
          accessibilityLabel={t('activity.gotItA11y', { title: request.title })}
          style={[styles.pill, { backgroundColor: colors.surfaceRaised }]}
        >
          <AppText style={[styles.title, { color: colors.accent }]}>{t('motion.gotIt')}</AppText>
          <AppText numberOfLines={1} variant="muted" style={styles.body}>
            {request.title}
          </AppText>
        </View>
      </View>
    );
  }
  return (
    <Animated.View
      entering={FadeIn}
      exiting={FadeOut}
      accessibilityRole="alert"
      accessibilityLabel={t('activity.gotItA11y', { title: request.title })}
      style={[styles.float, styles.card, { backgroundColor: colors.surfaceRaised }]}
    >
      <Swat title={request.title} onDone={onDone} />
      <View style={styles.row}>
        <AppText numberOfLines={1} style={[styles.title, { color: colors.text }]}>
          {request.title}
        </AppText>
        {request.release ? (
          <AppText variant="muted" numberOfLines={1}>
            {releaseLine(request.release, t)}
          </AppText>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  float: { position: 'absolute', left: space.md, right: space.md, bottom: PILL_BOTTOM },
  pill: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.card,
    elevation: 8,
  },
  card: { padding: space.md, gap: 10, borderRadius: 22, elevation: 8 },
  body: { flex: 1, gap: 5, minWidth: 0 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  title: { flexShrink: 1, fontFamily: fonts.bodyBold, fontSize: fontSize.small },
  track: { height: 5, borderRadius: radius.pill, overflow: 'hidden' },
  bar: { height: 5, borderRadius: radius.pill },
  more: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.pill },
  moreText: { fontFamily: fonts.bodyBold, fontSize: fontSize.tiny },
});
