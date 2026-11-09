import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, radius, sizes } from '@/theme/tokens';
import { AppText } from './AppText';

interface DropdownProps<T extends string> {
  /** What the choice is about, for screen readers ("Sort and filter"). */
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  /** Screen-reader label for tapping outside the menu to close it. */
  closeLabel: string;
}

/**
 * A pill that shows the current choice with ▾ and opens a menu of the options
 * (the Library's "Recently added ▾" on canvas board 6).
 */
export function Dropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  closeLabel,
}: DropdownProps<T>) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? ''}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={[styles.pill, { borderColor: colors.border }]}
      >
        <AppText style={[styles.text, { color: colors.text }]}>{current?.label} ▾</AppText>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View
          accessibilityViewIsModal
          style={[styles.scrim, { backgroundColor: `${colors.scrim}99` }]}
        >
          <Pressable
            accessibilityLabel={closeLabel}
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
          />
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={label}
            style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            {options.map((o) => {
              const selected = o.value === value;
              return (
                <Pressable
                  key={o.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={o.label}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  style={[styles.option, selected && { backgroundColor: colors.surfaceRaised }]}
                >
                  <AppText
                    style={[
                      styles.text,
                      {
                        color: selected ? colors.accent : colors.text,
                        fontFamily: selected ? fonts.bodyBold : fonts.bodySemiBold,
                      },
                    ]}
                  >
                    {o.label}
                  </AppText>
                  {selected ? (
                    <AppText style={[styles.text, { color: colors.accent }]}>✓</AppText>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  pill: {
    minHeight: sizes.touch,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontFamily: fonts.bodySemiBold, fontSize: fontSize.body },
  scrim: { flex: 1, justifyContent: 'center', padding: 32 },
  menu: { borderRadius: radius.button, borderWidth: 1, padding: 6, gap: 2 },
  option: {
    minHeight: sizes.touch,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
