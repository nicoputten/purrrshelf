import type { Recommendation } from '@purrshelf/contract';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { BookCover } from '@/components/BookCover';
import { useMotionMode } from '@/components/motion';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, sizes } from '@/theme/tokens';
import { isInstant, reasonLine, requestLine } from './reason';

export const CARD_WIDTH = 112;
export const COVER_HEIGHT = 166;

interface RecommendationCardProps {
  item: Recommendation;
  onOpen: () => void;
  onMore: () => void;
}

/**
 * One suggestion (board 10): cover, title, author and the ginger reason, with
 * "New" or "Instant" on the cover and a ⋯ menu. Tapping opens the book page.
 */
export function RecommendationCard({ item, onOpen, onMore }: RecommendationCardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { reduced } = useMotionMode();
  const { work } = item;
  const reason = reasonLine(item, t);
  const status = requestLine(item, t);
  const author = work.authors[0] ?? '';
  const badge = isInstant(item)
    ? { label: t('forYou.badgeInstant'), tone: 'success' as const }
    : item.isNew
      ? { label: t('forYou.badgeNew'), tone: 'accent' as const }
      : null;

  return (
    <Animated.View
      style={styles.card}
      {...(reduced ? {} : { exiting: FadeOut.duration(200) })}
      testID={`rec-${work.id}`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[work.title, author, reason, badge?.label, status]
          .filter(Boolean)
          .join(', ')}
        onPress={onOpen}
      >
        <View>
          <BookCover workId={work.id} title={work.title} width={CARD_WIDTH} height={COVER_HEIGHT} />
          {badge ? (
            <View style={styles.badge}>
              <Badge label={badge.label} tone={badge.tone} />
            </View>
          ) : null}
        </View>
        <AppText numberOfLines={2} style={[styles.title, { color: colors.text }]}>
          {work.title}
        </AppText>
        <AppText variant="muted" numberOfLines={1}>
          {author}
        </AppText>
        <AppText numberOfLines={2} style={[styles.reason, { color: colors.mine }]}>
          {reason}
        </AppText>
        {status ? (
          <AppText numberOfLines={1} style={[styles.status, { color: colors.success }]}>
            {status}
          </AppText>
        ) : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('forYou.more', { title: work.title })}
        hitSlop={8}
        onPress={onMore}
        style={[styles.more, { backgroundColor: `${colors.scrim}CC` }]}
      >
        <AppText style={[styles.moreText, { color: colors.text }]}>⋯</AppText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { width: CARD_WIDTH, gap: 2 },
  badge: { position: 'absolute', left: 6, bottom: 6 },
  title: { fontFamily: fonts.bodyBold, fontSize: fontSize.small, marginTop: 6 },
  reason: { fontFamily: fonts.bodySemiBold, fontSize: fontSize.tiny },
  status: { fontFamily: fonts.bodyBold, fontSize: fontSize.tiny },
  // 36 visible + hitSlop 8 = a 44+ target in the cover's corner.
  more: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: sizes.touch - 8,
    height: sizes.touch - 8,
    borderRadius: (sizes.touch - 8) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: { fontFamily: fonts.bodyBold, fontSize: fontSize.card, lineHeight: 18 },
});
