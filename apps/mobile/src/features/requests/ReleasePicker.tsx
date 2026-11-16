import type { ReleaseList, ReleaseOption } from '@purrshelf/contract';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { PawIcon } from '@/components/TabIcons';
import { PawLoader } from '@/components/motion';
import { errorMessage } from '@/lib/errors';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, radius, sizes, space } from '@/theme/tokens';
import { releaseLine } from './steps';
import { usePickRelease, useReleases, useRequests } from './useRequests';

const DAY = 24 * 60 * 60 * 1000;

/** "today", "3 days ago", "2 months ago", "4 years ago". */
export function releaseAge(publishedAt: string | null, now: Date, t: TFunction): string | null {
  if (!publishedAt) return null;
  const days = Math.floor((now.getTime() - new Date(publishedAt).getTime()) / DAY);
  if (days < 1) return t('picker.age.today');
  if (days < 31) return t('picker.age.days', { count: days });
  if (days < 365) return t('picker.age.months', { count: Math.floor(days / 30) });
  return t('picker.age.years', { count: Math.floor(days / 365) });
}

/** Results of the reader's own words (APP-18, board 16b). */
export interface MineSearch {
  words: string;
  indexer: string;
}

/**
 * Left out in the normal picker, but shown with a warning after the reader's
 * own search: they chose the words, so "another book?" is theirs to judge.
 */
const isAnotherBook = (o: ReleaseOption) =>
  o.rejected.length > 0 && o.rejected.every((r) => r === 'title_mismatch');

/** The card's label: Best match, Good, Weaker match, Language differs or Another book?. */
export function optionLabel(o: ReleaseOption, threshold: number, t: TFunction): string {
  if (o.picked) return `${t('picker.best')} · ${t('picker.fetching')}`;
  if (isAnotherBook(o)) return t('picker.anotherBook');
  if (o.rejected.includes('language_mismatch')) return t('picker.languageDiffers');
  if (o.rejected.length === 0 && o.score >= threshold) return t('picker.good');
  return t('picker.weaker');
}

/** "EPUB · 1.4 MB · English · title and author match", or why it was left out. */
export function optionLine(o: ReleaseOption, t: TFunction): string {
  const why = o.rejected.length
    ? o.rejected.map((r) => t(`picker.reasons.${r}`)).join(', ')
    : o.titleMatch && o.authorMatch
      ? t('picker.matchBoth')
      : o.titleMatch
        ? t('picker.matchTitle')
        : t('picker.matchWeak');
  return `${releaseLine(o, t)} · ${why}`;
}

/** Pick another release (APP-05, canvas board 5). Browsing is free; picking uses one grab. */
export function ReleasePickerScreen({
  requestId,
  onBack,
  onSearchMyself,
  mine = null,
  now = new Date(),
}: {
  requestId: string;
  onBack: () => void;
  /** Opens Search it yourself (APP-18). */
  onSearchMyself?: () => void;
  /** Set when these are the results of the reader's own words. */
  mine?: MineSearch | null;
  now?: Date;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const releases = useReleases(requestId);
  const requests = useRequests();
  const pick = usePickRelease();
  const [showAll, setShowAll] = useState(false);
  const title = requests.data?.requests.find((r) => r.id === requestId)?.title ?? '';

  return (
    <Screen>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('book.back')}
        onPress={onBack}
        style={styles.back}
      >
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Path
            d="M15 5L8 12L15 19"
            stroke={colors.text}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Pressable>
      <AppText variant="display" accessibilityRole="header">
        {mine ? t('picker.mineTitle') : t('picker.title')}
      </AppText>

      {releases.isPending ? (
        <PawLoader />
      ) : releases.isError ? (
        <View style={styles.state} accessibilityRole="alert">
          <AppText>{errorMessage(releases.error, t)}</AppText>
          <Button
            label={t('search.retry')}
            variant="outline"
            onPress={() => void releases.refetch()}
          />
        </View>
      ) : (
        <Options
          list={releases.data}
          title={title}
          mine={mine}
          onSearchMyself={onSearchMyself}
          now={now}
          showAll={showAll}
          onToggle={() => setShowAll((v) => !v)}
          busyId={pick.isPending ? pick.variables.releaseId : null}
          onPick={(releaseId) => pick.mutate({ id: requestId, releaseId }, { onSuccess: onBack })}
          error={pick.error}
          t={t}
        />
      )}
    </Screen>
  );
}

function Options({
  list,
  title,
  mine,
  onSearchMyself,
  now,
  showAll,
  onToggle,
  busyId,
  onPick,
  error,
  t,
}: {
  list: ReleaseList;
  title: string;
  mine: MineSearch | null;
  onSearchMyself: (() => void) | undefined;
  now: Date;
  showAll: boolean;
  onToggle: () => void;
  busyId: string | null;
  onPick: (releaseId: string) => void;
  error: unknown;
  t: TFunction;
}) {
  const { colors } = useTheme();
  const shown = (r: ReleaseOption) =>
    r.rejected.length === 0 || r.picked || (mine !== null && isAnotherBook(r));
  const usable = list.releases.filter(shown);
  const leftOut = list.releases.filter((r) => !shown(r));
  const notHere = onSearchMyself ? (
    <NotHere mine={mine !== null} onSearchMyself={onSearchMyself} t={t} />
  ) : null;
  if (list.releases.length === 0) {
    return (
      <>
        <AppText variant="muted">{t('picker.empty')}</AppText>
        {notHere}
      </>
    );
  }
  const card = (o: ReleaseOption) => (
    <OptionCard
      key={o.id}
      option={o}
      threshold={list.acceptThreshold}
      now={now}
      busy={busyId === o.id}
      onPick={() => onPick(o.id)}
      mine={mine !== null}
      t={t}
    />
  );
  return (
    <>
      <AppText variant="muted">
        {mine
          ? t('picker.mineResults', {
              words: mine.words,
              indexer: mine.indexer,
              count: list.releases.length,
            })
          : t('picker.results', { title, count: list.releases.length })}
      </AppText>
      {mine ? (
        <View style={[styles.banner, { backgroundColor: colors.mineBg }]}>
          <PawIcon color={colors.mine} size={18} />
          <AppText style={[styles.fill, { color: colors.mine }]}>{t('picker.mineBanner')}</AppText>
        </View>
      ) : (
        <View style={[styles.banner, { backgroundColor: colors.successBg }]}>
          <PawIcon color={colors.onSuccessBg} size={18} />
          <AppText style={[styles.fill, { color: colors.onSuccessBg }]}>{t('picker.free')}</AppText>
        </View>
      )}
      {error ? (
        <AppText accessibilityRole="alert" style={{ color: colors.danger }}>
          {errorMessage(error, t)}
        </AppText>
      ) : null}
      {usable.map(card)}
      {leftOut.length > 0 ? (
        <View style={[styles.card, { backgroundColor: colors.surfaceMuted }]}>
          <AppText style={styles.label}>{t('picker.leftOut', { count: leftOut.length })}</AppText>
          <AppText variant="muted">
            {[...new Set(leftOut.flatMap((o) => o.rejected))]
              .map((r) => t(`picker.reasons.${r}`))
              .join(', ')}
          </AppText>
          <Button
            label={showAll ? t('picker.hide') : t('picker.showAnyway')}
            variant="text"
            onPress={onToggle}
          />
        </View>
      ) : null}
      {showAll ? leftOut.map(card) : null}
      {notHere}
    </>
  );
}

/** "Not in this list? Search it myself", or "Other words" under the reader's own results. */
function NotHere({
  mine,
  onSearchMyself,
  t,
}: {
  mine: boolean;
  onSearchMyself: () => void;
  t: TFunction;
}) {
  const { colors } = useTheme();
  if (mine) {
    return <Button label={t('picker.otherWords')} variant="text" onPress={onSearchMyself} />;
  }
  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceMuted }]}>
      <AppText style={[styles.label, { color: colors.text }]}>{t('picker.notHere')}</AppText>
      <AppText variant="muted">{t('picker.notHereText')}</AppText>
      <Button label={t('picker.searchMyself')} variant="outline" onPress={onSearchMyself} />
    </View>
  );
}

function OptionCard({
  option,
  threshold,
  now,
  busy,
  onPick,
  mine,
  t,
}: {
  option: ReleaseOption;
  threshold: number;
  now: Date;
  busy: boolean;
  onPick: () => void;
  mine: boolean;
  t: TFunction;
}) {
  const { colors } = useTheme();
  const good = option.rejected.length === 0 && option.score >= threshold;
  const age = releaseAge(option.publishedAt, now, t);
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface },
        option.picked && { borderWidth: 2, borderColor: colors.accent },
      ]}
    >
      <View style={styles.row}>
        <AppText style={[styles.label, { color: option.picked ? colors.accent : colors.text }]}>
          {optionLabel(option, threshold, t)}
        </AppText>
        {age ? <AppText variant="muted">{age}</AppText> : null}
      </View>
      <AppText numberOfLines={2} style={[styles.name, { color: colors.text }]}>
        {option.title}
      </AppText>
      <AppText variant="muted">{optionLine(option, t)}</AppText>
      {option.picked ? null : (
        <Button
          label={
            mine
              ? isAnotherBook(option)
                ? t('picker.fetchAnyway')
                : t('picker.fetchThis')
              : t('picker.useThis')
          }
          variant={good ? 'primary' : 'outline'}
          busy={busy}
          disabled={option.rejected.includes('failed_before')}
          onPress={onPick}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  back: { width: sizes.touch, height: sizes.touch, alignItems: 'center', justifyContent: 'center' },
  state: { alignItems: 'center', gap: space.md, paddingVertical: 40 },
  banner: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    padding: space.md,
    borderRadius: radius.card - 4,
  },
  card: { gap: space.sm, padding: space.lg, borderRadius: radius.card },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontFamily: fonts.bodyBold },
  name: { fontFamily: fonts.headingMedium, fontSize: fontSize.body },
});
