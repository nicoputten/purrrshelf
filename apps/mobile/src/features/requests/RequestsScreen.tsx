import { MAX_SEARCHES_PER_INDEXER, type BookRequest } from '@purrshelf/contract';
import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { BookCover } from '@/components/BookCover';
import { BudgetPill } from '@/components/BudgetPill';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { languageName } from '@/features/search/SearchResult';
import { useSearchBudget } from '@/features/search/useBookSearch';
import { errorMessage } from '@/lib/errors';
import { useSession } from '@/session/session';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, radius, space } from '@/theme/tokens';
import { requestSteps, type Step } from './steps';
import { useRequestEvents } from './useRequestEvents';
import { useCancelRequest, useReaders, useRequests, useRetryRequest } from './useRequests';

/** One line on where a request stands (also the card's screen-reader label). */
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

/** Most searches one Try again can cost: every variant on every indexer with a budget. */
function useMaxSearches(): number {
  const call = useSession((s) => s.call);
  const budget = useQuery({ queryKey: ['budget'], queryFn: () => call('budget') });
  const active = budget.data?.indexers.filter((i) => i.searches.limit > 0).length ?? 1;
  return Math.max(1, active) * MAX_SEARCHES_PER_INDEXER;
}

export interface RequestsScreenProps {
  /** Opens "Pick another" for a request (APP-05). */
  onPick: (requestId: string) => void;
  onFindBook: () => void;
}

/** Requests & progress (APP-03, APP-05; canvas board 4): live over server-sent events. */
export function RequestsScreen({ onPick, onFindBook }: RequestsScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  useRequestEvents();
  const requests = useRequests();
  const readers = useReaders();
  const budget = useSearchBudget();
  const maxSearches = useMaxSearches();
  const myId = readers.data?.readers.find((r) => r.me)?.id;
  // Dismissed (cancelled) requests leave the list.
  const list = (requests.data?.requests ?? []).filter((r) => r.status !== 'cancelled');

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
          <Button label={t('requests.findBook')} variant="outline" onPress={onFindBook} />
        </View>
      ) : (
        list.map((r) => (
          <RequestCard
            key={r.id}
            request={r}
            myId={myId}
            maxSearches={maxSearches}
            onPick={() => onPick(r.id)}
          />
        ))
      )}
    </Screen>
  );
}

function RequestCard({
  request,
  myId,
  maxSearches,
  onPick,
}: {
  request: BookRequest;
  myId: string | undefined;
  maxSearches: number;
  onPick: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const retry = useRetryRequest();
  const cancel = useCancelRequest();
  const forMe = myId !== undefined && request.pushTo.includes(myId);
  const target =
    request.pushTo.length === 0
      ? t('requests.forLibrary')
      : forMe
        ? t('requests.forKobo')
        : t('requests.forOtherKobo');
  const meta = [target, languageName(request.language)].join(' · ');
  const finished = request.status === 'pushed';
  const notFound = request.status === 'not_found';
  const canRetry =
    notFound || ['choose_release', 'download_failed', 'import_failed'].includes(request.status);
  const canPick = ['choose_release', 'downloading', 'download_failed', 'import_failed'].includes(
    request.status,
  );
  const error = retry.error ?? cancel.error;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View
        accessible
        accessibilityLabel={`${request.title}, ${statusLine(request, myId, t)}`}
        style={styles.top}
      >
        <BookCover workId={request.workId} title={request.title} width={44} height={66} size="s" />
        <View style={styles.text}>
          <AppText numberOfLines={2} style={[styles.title, { color: colors.text }]}>
            {request.title}
          </AppText>
          <AppText variant="muted" numberOfLines={1}>
            {meta}
          </AppText>
          {finished ? (
            <AppText style={[styles.bold, { color: colors.success }]}>
              {forMe ? t('requests.finished') : t('requests.finishedOther')}
            </AppText>
          ) : notFound ? (
            <>
              <AppText style={[styles.bold, { color: colors.text }]}>
                {t('requests.notFoundTitle')}
              </AppText>
              <AppText variant="muted">
                {request.searches > 0
                  ? t('requests.notFoundDetail', {
                      count: request.searches,
                      indexers: request.searchedOn.join(', '),
                    })
                  : t('requests.notFoundNone')}
              </AppText>
            </>
          ) : request.status === 'in_library' ? (
            <AppText style={[styles.bold, { color: colors.success }]}>
              {statusLine(request, myId, t)}
            </AppText>
          ) : null}
        </View>
      </View>

      {finished || notFound || request.status === 'in_library' ? null : (
        <View style={styles.steps}>
          {requestSteps(request, myId, t).map((step) => (
            <StepRow
              key={step.key}
              step={step}
              progress={step.key === 'download' ? request.progress : null}
              {...(step.key === 'pick' && canPick ? { onPick } : {})}
            />
          ))}
        </View>
      )}

      {error ? (
        <AppText accessibilityRole="alert" style={{ color: colors.danger }}>
          {errorMessage(error, t)}
        </AppText>
      ) : null}

      {canRetry ? (
        <View style={styles.actions}>
          <Button
            label={t('requests.tryAgain', { max: maxSearches })}
            variant={notFound ? 'primary' : 'outline'}
            busy={retry.isPending}
            onPress={() => retry.mutate(request.id)}
          />
          <Button
            label={t('requests.dismiss')}
            variant="text"
            busy={cancel.isPending}
            onPress={() => cancel.mutate(request.id)}
          />
        </View>
      ) : null}
    </View>
  );
}

function StepRow({
  step,
  progress,
  onPick,
}: {
  step: Step;
  progress: number | null;
  onPick?: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const dot =
    step.state === 'done'
      ? colors.success
      : step.state === 'current'
        ? colors.accent
        : step.state === 'failed'
          ? colors.danger
          : colors.border;
  return (
    <View style={styles.step}>
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <View
        accessible
        accessibilityLabel={[
          step.label,
          step.detail,
          t(`requests.steps.${step.state === 'failed' ? 'current' : step.state}`),
        ]
          .filter(Boolean)
          .join(', ')}
        style={styles.text}
      >
        <AppText
          style={{
            fontFamily: step.state === 'current' ? fonts.bodyBold : fonts.bodySemiBold,
            color: step.state === 'pending' ? colors.textMuted : colors.text,
          }}
        >
          {step.label}
        </AppText>
        {step.detail ? <AppText variant="muted">{step.detail}</AppText> : null}
        {step.key === 'download' && step.state === 'current' ? (
          <View style={[styles.bar, { backgroundColor: colors.surfaceRaised }]}>
            <View
              style={[
                styles.barFill,
                { backgroundColor: colors.accent, width: `${progress ?? 0}%` },
              ]}
            />
          </View>
        ) : null}
      </View>
      {onPick ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('requests.pickAnother')}
          onPress={onPick}
          style={[styles.pill, { borderColor: colors.border }]}
        >
          <AppText style={[styles.bold, { color: colors.text }]}>
            {t('requests.pickAnother')}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  state: { alignItems: 'center', gap: space.md, paddingVertical: 40 },
  card: { gap: space.md, padding: space.md, borderRadius: radius.card },
  top: { flexDirection: 'row', gap: space.md },
  text: { flex: 1, gap: space.xs },
  title: { fontFamily: fonts.headingMedium, fontSize: fontSize.body },
  bold: { fontFamily: fonts.bodyBold },
  steps: { gap: space.sm },
  step: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  dot: { width: 12, height: 12, borderRadius: radius.pill, marginTop: 5 },
  bar: { height: 8, borderRadius: radius.pill, overflow: 'hidden', marginTop: space.xs },
  barFill: { height: 8, borderRadius: radius.pill },
  pill: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  actions: { gap: space.xs },
});
