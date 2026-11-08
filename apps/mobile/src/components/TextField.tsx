import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, sizes } from '@/theme/tokens';
import { AppText } from './AppText';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | undefined;
}

export function TextField({ label, error, onFocus, onBlur, ...input }: TextFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            color: colors.text,
            borderColor: error ? colors.danger : focused ? colors.accent : colors.border,
          },
        ]}
        {...input}
      />
      {error ? (
        <AppText accessibilityRole="alert" style={[styles.error, { color: colors.danger }]}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  input: {
    height: sizes.input,
    borderRadius: radius.input,
    borderWidth: 2,
    paddingHorizontal: 16,
    fontFamily: fonts.body,
    fontSize: 17,
  },
  error: { fontSize: 14 },
});
