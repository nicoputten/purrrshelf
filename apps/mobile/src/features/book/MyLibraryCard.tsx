import type { ItemOwnership, LibraryState } from '@purrshelf/contract';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { errorMessage } from '@/lib/errors';
import { useTheme } from '@/theme/ThemeProvider';
import { useOwnershipChange } from './useOwnership';

/**
 * "Remove from my library" for a book I own, with an Undo right after; for a
 * library book I don't own, "Add to my library" (BRK-08, ADR 0009).
 */
export function MyLibraryCard({ library }: { library: LibraryState }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const change = useOwnershipChange(library.itemId);
  // The broker's answer to my last removal, so Undo can be offered.
  const [removed, setRemoved] = useState<ItemOwnership | null>(null);
  const mine = library.owners.some((o) => o.me);

  let content;
  if (mine) {
    content = (
      <Button
        label={t('book.removeFromLibrary')}
        variant="outline"
        busy={change.isPending}
        onPress={() => change.mutate('remove', { onSuccess: setRemoved })}
      />
    );
  } else if (removed) {
    content = (
      <View style={styles.row}>
        <AppText variant="muted" style={styles.text}>
          {removed.deleteAfter ? t('book.removedNobody') : t('book.removed')}
        </AppText>
        <Button
          compact
          label={t('book.undo')}
          variant="outline"
          busy={change.isPending}
          onPress={() => change.mutate('keep', { onSuccess: () => setRemoved(null) })}
        />
      </View>
    );
  } else {
    content = (
      <Button
        label={t('book.addToMyLibrary')}
        busy={change.isPending}
        onPress={() => change.mutate('keep')}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      {content}
      {change.isError ? (
        <AppText accessibilityRole="alert" style={{ color: colors.danger }}>
          {errorMessage(change.error, t)}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1 },
});
