import type { BookRequest } from '@purrshelf/contract';
import type { TFunction } from 'i18next';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { BookCover } from '@/components/BookCover';
import { BudgetPill } from '@/components/BudgetPill';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { languageName } from '@/features/search/SearchResult';
import { useSearchBudget } from '@/features/search/useBookSearch';
import { errorMessage } from '@/lib/errors';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, radius, space } from '@/theme/tokens';
import { isSettled, useReaders, useRequests } from './useRequests';

/** One line on where a request stands. */
export function statusLine(request: BookRequest, myId: string | undefined, t: TFunction): string {
  switch (request.status) {
    case 'downloading':
      return t('requests.status.downloading', { progress: request.progress ?? 0 });
    case 'in_library':
      return request.pushTo.length > 0
        ? t('requests.status.notOnKobo')
        : t('requests.status.in_library');
    case 'pushed':
      return myId && request.pushTo.includes(myId)
        ? t('requests.status.pushed')
        : t('requests.status.pushedOther');
    default:
      return t(`requests.status.${request.status}`);
  }
}

/** Requests (APP-03): every add, live until it is on the Kobo. Steps and picking come with APP-05. */
export function RequestsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const requests = useRequests();
  const readers = useReaders();
  const budget = useSearchBudget();
  const myId = readers.data?.readers.find((r) => r.me)?.id;
  const list = requests.data?.requests ?? [];

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="display" accessibilityRole="header">
          {t('requests.title')}
        </AppText>
        <BudgetPill budget={budget} onPress={() => undefined} />
      </View>
      {requests.isPending ? (
        <ActivityIndicator color={colors.accent} />
      ) : requests.isError ? (
        <View style={styles.state} accessibilityRole="alert">
          <AppText>{errorMessage(requests.error, t)}</AppText>
          <Button
            label={t('search.retry')}
            variant="outline"
            onPress={() => void requests.refetch()}
          />
        </View>
      ) : list.length === 0 ? (
        <View style={styles.state}>
          <AppText variant="muted">{t('requests.empty')}</AppText>
          <Button
            label={t('requests.findBook')}
            variant="outline"
            onPress={() => router.navigate('/')}
          />
        </View>
      ) : (
        list.map((r) => <RequestCard key={r.id} request={r} myId={myId} t={t} />)
      )}
    </Screen>
  );
}

function RequestCard({
  request,
  myId,
  t,
}: {
  request: BookRequest;
  myId: string | undefined;
  t: TFunction;
}) {
  const { colors } = useTheme();
  const line = statusLine(request, myId, t);
  const done = request.status === 'pushed' || request.status === 'in_library';
  const failed = isSettled(request) && !done && request.status !== 'cancelled';
  const meta = [request.authors.slice(0, 2).join(', '), languageName(request.language)]
    .filter(Boolean)
    .join(' · ');
  return (
    <View
      accessible
      accessibilityLabel={`${request.title}, ${line}`}
      style={[styles.card, { backgroundColor: colors.surface }]}
    >
      <BookCover workId={request.workId} title={request.title} width={44} height={66} size="s" />
      <View style={styles.text}>
        <AppText numberOfLines={2} style={[styles.title, { color: colors.text }]}>
          {request.title}
        </AppText>
        <AppText variant="muted" numberOfLines={1}>
          {meta}
        </AppText>
        <AppText
          style={{
            fontFamily: fonts.bodyBold,
            color: done ? colors.success : failed ? colors.danger : colors.text,
          }}
        >
          {line}
        </AppText>
        {request.status === 'downloading' ? (
          <View style={[styles.bar, { backgroundColor: colors.surfaceRaised }]}>
            <View
              style={[
                styles.barFill,
                { backgroundColor: colors.accent, width: `${request.progress ?? 0}%` },
              ]}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  state: { alignItems: 'center', gap: space.md, paddingVertical: 40 },
  card: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.card },
  text: { flex: 1, gap: space.xs },
  title: { fontFamily: fonts.headingMedium, fontSize: fontSize.body },
  bar: { height: 8, borderRadius: radius.pill, overflow: 'hidden', marginTop: space.xs },
  barFill: { height: 8, borderRadius: radius.pill },
});
