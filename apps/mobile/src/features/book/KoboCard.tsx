import type { ItemKobo, KoboState } from '@purrshelf/contract';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { errorMessage } from '@/lib/errors';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, radius } from '@/theme/tokens';
import { useKoboChange, useKobos, type KoboAction } from './useKobos';

/** The action a row offers: Remove while the book is (going) on the Kobo, else Send. */
export function koboAction(state: KoboState): KoboAction | null {
  if (state === 'not_set_up') return null;
  return state === 'on_device' || state === 'sending' ? 'remove' : 'send';
}

/** Device card on the book page: one row per reader's Kobo (APP-06, canvas board 2). */
export function KoboCard({ itemId }: { itemId: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const kobos = useKobos(itemId);
  const change = useKoboChange(itemId);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <AppText style={styles.section}>{t('book.devices')}</AppText>
      {kobos.isPending ? (
        <ActivityIndicator color={colors.accent} />
      ) : kobos.isError ? (
        <View accessibilityRole="alert" style={styles.problem}>
          <AppText variant="muted">{errorMessage(kobos.error, t)}</AppText>
          <Button
            label={t('search.retry')}
            variant="outline"
            compact
            onPress={() => void kobos.refetch()}
          />
        </View>
      ) : (
        kobos.data.kobos.map((kobo) => (
          <KoboRow
            key={kobo.userId}
            kobo={kobo}
            busy={change.isPending && change.variables.userId === kobo.userId}
            onAction={(action) => change.mutate({ action, userId: kobo.userId })}
          />
        ))
      )}
      {change.isError ? (
        <AppText accessibilityRole="alert" style={{ color: colors.danger }}>
          {errorMessage(change.error, t)}
        </AppText>
      ) : null}
    </View>
  );
}

function KoboRow({
  kobo,
  busy,
  onAction,
}: {
  kobo: ItemKobo;
  busy: boolean;
  onAction: (action: KoboAction) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const action = koboAction(kobo.state);
  const name = kobo.me ? t('book.yourKobo') : t('book.ownerKobo', { name: kobo.displayName });
  const stateColor = kobo.state === 'on_device' ? colors.success : colors.textMuted;
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <AppText style={[styles.name, { color: colors.text }]}>{name}</AppText>
        <AppText style={{ color: stateColor }}>{t(`book.kobo.${kobo.state}`)}</AppText>
      </View>
      {action ? (
        <Button
          compact
          label={t(`book.${action}`)}
          accessibilityLabel={t(action === 'send' ? 'book.sendTo' : 'book.removeFrom', {
            kobo: name,
          })}
          variant={action === 'send' ? 'primary' : 'outline'}
          busy={busy}
          onPress={() => onAction(action)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, padding: 16, gap: 12 },
  section: { fontFamily: fonts.heading, fontSize: fontSize.section },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.bodyBold },
  problem: { gap: 8, alignItems: 'flex-start' },
});
