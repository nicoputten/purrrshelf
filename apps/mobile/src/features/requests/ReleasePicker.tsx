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

/** The card's label: Best match, Good, Weaker match or Language differs. */
export function optionLabel(o: ReleaseOption, threshold: number, t: TFunction): string {
  if (o.picked) return `${t('picker.best')} · ${t('picker.fetching')}`;
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
  now = new Date(),
}: {
  requestId: string;
  onBack: () => void;
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
        {t('picker.title')}
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
  now: Date;
  showAll: boolean;
  onToggle: () => void;
  busyId: string | null;
  onPick: (releaseId: string) => void;
  error: unknown;
  t: TFunction;
}) {
  const { colors } = useTheme();
  const usable = list.releases.filter((r) => r.rejected.length === 0 || r.picked);
  const leftOut = list.releases.filter((r) => r.rejected.length > 0 && !r.picked);
  if (list.releases.length === 0) return <AppText variant="muted">{t('picker.empty')}</AppText>;
  const card = (o: ReleaseOption) => (
    <OptionCard
      key={o.id}
      option={o}
      threshold={list.acceptThreshold}
      now={now}
      busy={busyId === o.id}
      onPick={() => onPick(o.id)}
      t={t}
    />
  );
  return (
    <>
      <AppText variant="muted">
        {t('picker.results', { title, count: list.releases.length })}
      </AppText>
      <View style={[styles.banner, { backgroundColor: colors.successBg }]}>
        <PawIcon color={colors.onSuccessBg} size={18} />
        <AppText style={[styles.fill, { color: colors.onSuccessBg }]}>{t('picker.free')}</AppText>
      </View>
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
    </>
  );
}

function OptionCard({
  option,
  threshold,
  now,
  busy,
  onPick,
  t,
}: {
  option: ReleaseOption;
  threshold: number;
  now: Date;
  busy: boolean;
  onPick: () => void;
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
          label={t('picker.useThis')}
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
