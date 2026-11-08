import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, sizes } from '@/theme/tokens';
import { AppText } from './AppText';

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** Radio group styled like the canvas' segmented control. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.group, { backgroundColor: colors.surface }]}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={[styles.option, selected && { backgroundColor: colors.accent }]}
          >
            <AppText
              style={{
                fontFamily: selected ? fonts.bodyBold : fonts.bodySemiBold,
                color: selected ? colors.onAccent : colors.text,
              }}
            >
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.button },
  option: {
    flex: 1,
    minHeight: sizes.touch,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
