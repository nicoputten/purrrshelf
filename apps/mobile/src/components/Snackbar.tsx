import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';

export const SNACKBAR_MS = 5000;

interface SnackbarProps {
  message: string;
  actionLabel: string;
  onAction: () => void;
  /** Called after {@link SNACKBAR_MS}, or right after the action. */
  onDone: () => void;
}

/** A short message at the bottom with one action, gone after 5 s ("Hidden …" · Undo). */
export function Snackbar({ message, actionLabel, onAction, onDone }: SnackbarProps) {
  const { colors } = useTheme();
  useEffect(() => {
    const timer = setTimeout(onDone, SNACKBAR_MS);
    return () => clearTimeout(timer);
  }, [message, onDone]);
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.bar, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
    >
      <AppText style={styles.message}>{message}</AppText>
      <Button
        label={actionLabel}
        variant="text"
        compact
        onPress={() => {
          onAction();
          onDone();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    bottom: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.button,
    paddingLeft: space.lg,
    paddingRight: space.sm,
    paddingVertical: space.sm,
  },
  message: { flex: 1 },
});
