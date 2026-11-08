import { Text, type TextProps } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize } from '@/theme/tokens';

type Variant = 'display' | 'title' | 'body' | 'muted' | 'label';

const variantStyle = {
  display: { fontFamily: fonts.heading, fontSize: fontSize.display, lineHeight: 35 },
  title: { fontFamily: fonts.heading, fontSize: fontSize.title },
  body: { fontFamily: fonts.body, fontSize: fontSize.body, lineHeight: 22 },
  muted: { fontFamily: fonts.body, fontSize: fontSize.small },
  label: { fontFamily: fonts.bodyBold, fontSize: fontSize.small },
} as const;

export function AppText({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  const { colors } = useTheme();
  const color = variant === 'muted' || variant === 'label' ? colors.textMuted : colors.text;
  return <Text style={[variantStyle[variant], { color }, style]} {...rest} />;
}
