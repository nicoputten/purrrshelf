import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, sizes } from '@/theme/tokens';
import { AppText } from './AppText';
import { PawLoader } from './motion/PawLoader';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'text';
  busy?: boolean;
  disabled?: boolean;
  /** A small inline button, e.g. Send / Remove on a device row. */
  compact?: boolean;
  /** Read by screen readers instead of the label, when the label alone is ambiguous. */
  accessibilityLabel?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  busy,
  disabled,
  compact,
  accessibilityLabel,
}: ButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        variant === 'text' ? styles.text : styles.base,
        compact && styles.compact,
        variant === 'primary' && {
          backgroundColor: pressed ? colors.accentPressed : colors.accent,
        },
        variant === 'outline' && { borderWidth: 1, borderColor: colors.border },
        inactive && styles.inactive,
      ]}
    >
      {busy ? (
        <PawLoader color={variant === 'primary' ? colors.onAccent : colors.text} size={12} />
      ) : (
        <AppText
          style={[
            styles.label,
            compact && styles.compactLabel,
            {
              color:
                variant === 'primary'
                  ? colors.onAccent
                  : variant === 'text'
                    ? colors.textMuted
                    : colors.text,
            },
          ]}
        >
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: sizes.primaryButton,
    borderRadius: radius.button + 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  text: { minHeight: sizes.touch, alignItems: 'center', justifyContent: 'center', padding: 10 },
  label: { fontFamily: fonts.bodyBold, fontSize: 17 },
  compact: { height: sizes.touch, paddingHorizontal: 16 },
  compactLabel: { fontSize: 15 },
  inactive: { opacity: 0.6 },
});
