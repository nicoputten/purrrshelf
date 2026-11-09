import type { BookRequest } from '@purrshelf/contract';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { BookCover } from '@/components/BookCover';
import { PawIcon } from '@/components/TabIcons';
import { Swat, useOneShot } from '@/components/motion';
import { errorMessage } from '@/lib/errors';
import { statusLine } from '@/features/requests/RequestsScreen';
import { swatEvent, swatFresh, swatScope } from '@/features/requests/motion';
import { useReaders, useRetryRequest } from '@/features/requests/useRequests';
import { useSearchBudget } from '@/features/search/useBookSearch';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, radius, sizes, space } from '@/theme/tokens';
import { daysAgo, NEEDS_YOU, needKey, sheetSections } from './activity';
import { useActivity } from './useActivity';

/** "today", "yesterday", "3 days ago". */
export function whenLine(iso: string, t: TFunction, now = new Date()): string {
  const days = daysAgo(iso, now);
  return days === 0 ? t('activity.today') : t('activity.daysAgo', { count: days });
}

/**
 * The Requests sheet (APP-14, board 14): opened from the activity pill or a
 * budget pill. "Now" lists what is on its way and what needs the reader,
 * "Earlier" the last few finished books, then a link to the full list.
 */
export function RequestsSheet({ requests }: { requests: readonly BookRequest[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const open = useActivity((s) => s.sheetOpen);
  const close = useActivity((s) => s.closeSheet);
  const markSeen = useActivity((s) => s.markSeen);
  const budget = useSearchBudget();
  const readers = useReaders();
  const myId = readers.data?.readers.find((r) => r.me)?.id;
  const { now, earlier } = sheetSections(requests);
  const needKeys = now
    .filter((r) => NEEDS_YOU.includes(r.status))
    .map(needKey)
    .join('|');

  // Opening the sheet is "seeing" what needs the reader: the pink pill goes away.
  useEffect(() => {
    if (open && needKeys) markSeen(needKeys.split('|'));
  }, [open, needKeys, markSeen]);

  const go = (to: () => void) => {
    close();
    to();
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('activity.close')}
        onPress={close}
        style={[styles.backdrop, { backgroundColor: `${colors.scrim}B3` }]}
      />
      <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <View style={styles.header}>
          <AppText variant="title" accessibilityRole="header" style={styles.sheetTitle}>
            {t('requests.title')}
          </AppText>
          {budget ? (
            <View style={styles.budget}>
              <PawIcon color={colors.accent} size={16} />
              <AppText style={[styles.bold, { color: colors.text }]}>
                {t('activity.budget', { ...budget })}
              </AppText>
            </View>
          ) : null}
        </View>
        <ScrollView contentContainerStyle={styles.list}>
          <AppText style={[styles.section, { color: colors.textMuted }]}>
            {t('activity.now')}
          </AppText>
          {now.length === 0 ? (
            <AppText variant="muted">{t('activity.nothingNow')}</AppText>
          ) : (
            now.map((r) => (
              <Row
                key={r.id}
                request={r}
                myId={myId}
                onPick={() =>
                  go(() => router.push({ pathname: '/request/[id]', params: { id: r.id } }))
                }
              />
            ))
          )}
          {earlier.length > 0 ? (
            <>
              <AppText style={[styles.section, { color: colors.textMuted }]}>
                {t('activity.earlier')}
              </AppText>
              {earlier.map((r) => (
                <Row key={r.id} request={r} myId={myId} />
              ))}
            </>
          ) : null}
          <Pressable
            accessibilityRole="link"
            onPress={() => go(() => router.push('/requests'))}
            style={styles.seeAll}
          >
            <AppText style={[styles.bold, { color: colors.accent }]}>
              {t('activity.seeAll')}
            </AppText>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Row({
  request,
  myId,
  onPick,
}: {
  request: BookRequest;
  myId: string | undefined;
  onPick?: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const retry = useRetryRequest();
  // While the sheet is open, Swat plays in this row instead of the pill (board 9d).
  const swat = useOneShot(swatScope(request), swatEvent(request), swatFresh(request));
  const finished = request.status === 'pushed' || request.status === 'in_library';
  const needs = NEEDS_YOU.includes(request.status);
  const forMe = myId !== undefined && request.pushTo.includes(myId);
  const line = finished
    ? [
        request.status === 'pushed'
          ? forMe
            ? t('requests.finished')
            : t('requests.finishedOther')
          : t('requests.status.in_library'),
        whenLine(request.updatedAt, t),
      ].join(' · ')
    : request.status === 'not_found' && request.searches > 0
      ? `${t('requests.notFoundTitle')} · ${t('activity.searches', { count: request.searches })}`
      : statusLine(request, myId, t);
  const tone = finished ? colors.success : needs ? colors.partner : colors.textMuted;

  return (
    <View style={[styles.row, { backgroundColor: colors.surfaceRaised }]}>
      <View style={styles.rowTop}>
        <BookCover workId={request.workId} title={request.title} width={40} height={60} size="s" />
        <View style={styles.text}>
          <AppText numberOfLines={2} style={[styles.title, { color: colors.text }]}>
            {request.title}
          </AppText>
          <AppText style={{ color: tone, fontSize: fontSize.small }}>{line}</AppText>
          {request.status === 'downloading' ? (
            <View style={[styles.track, { backgroundColor: colors.background }]}>
              <View
                style={[
                  styles.bar,
                  { width: `${request.progress ?? 0}%`, backgroundColor: colors.accent },
                ]}
              />
            </View>
          ) : null}
          {request.status === 'not_found' ? (
            <Action label={t('activity.tryAgain')} onPress={() => retry.mutate(request.id)} />
          ) : needs && onPick ? (
            <Action label={t('requests.pickAnother')} onPress={onPick} />
          ) : null}
          {retry.error ? (
            <AppText accessibilityRole="alert" style={{ color: colors.danger }}>
              {errorMessage(retry.error, t)}
            </AppText>
          ) : null}
        </View>
      </View>
      {swat.playing ? <Swat title={request.title} onDone={swat.done} /> : null}
    </View>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.action, { borderColor: colors.accent }]}
    >
      <AppText style={[styles.bold, { color: colors.accent }]}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: {
    maxHeight: '85%',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: space.xl,
    gap: 14,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  sheetTitle: { fontSize: 24 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: radius.pill },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  budget: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  list: { gap: 10, paddingBottom: space.md },
  section: { fontFamily: fonts.bodyBold, fontSize: fontSize.tiny, letterSpacing: 0.5 },
  row: { padding: space.md, borderRadius: 18, gap: space.sm },
  rowTop: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  text: { flex: 1, gap: 6 },
  title: { fontFamily: fonts.headingMedium, fontSize: fontSize.body },
  bold: { fontFamily: fonts.bodyBold, fontSize: fontSize.small },
  track: { height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  bar: { height: 6, borderRadius: radius.pill },
  action: {
    alignSelf: 'flex-start',
    minHeight: sizes.touch,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  seeAll: { alignSelf: 'center', minHeight: sizes.touch, justifyContent: 'center', padding: 8 },
});
