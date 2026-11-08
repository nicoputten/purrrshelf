import { StyleSheet, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, sizes } from '@/theme/tokens';
import { CatEars } from './CatEars';

interface SearchFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
}

/** The one search field on Search: 56 high, accent border, cat ears. */
export function SearchField({
  label,
  placeholder,
  value,
  onChangeText,
  onSubmit,
}: SearchFieldProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.field, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
      <CatEars color={colors.accent} />
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
        <Circle cx={10.5} cy={10.5} r={6.5} stroke={colors.textMuted} strokeWidth={2.4} />
        <Path
          d="M15.5 15.5L21 21"
          stroke={colors.textMuted}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      </Svg>
      <TextInput
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        autoCorrect={false}
        style={[styles.input, { color: colors.text }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    height: sizes.input,
    borderRadius: radius.input,
    borderWidth: 2,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  input: { flex: 1, height: '100%', fontFamily: fonts.body, fontSize: 17 },
});
