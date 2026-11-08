import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, sizes } from '@/theme/tokens';
import { AppText } from './AppText';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'text';
  busy?: boolean;
  disabled?: boolean;
}

export function Button({ label, onPress, variant = 'primary', busy, disabled }: ButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        variant === 'text' ? styles.text : styles.base,
        variant === 'primary' && {
          backgroundColor: pressed ? colors.accentPressed : colors.accent,
        },
        variant === 'outline' && { borderWidth: 1, borderColor: colors.border },
        inactive && styles.inactive,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onAccent : colors.text} />
      ) : (
        <AppText
          style={[
            styles.label,
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
  inactive: { opacity: 0.6 },
});
