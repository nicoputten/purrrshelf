import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** `overlay` sits on top of the scrolling content, e.g. a snackbar. */
export function Screen({ children, overlay }: { children: ReactNode; overlay?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.fill} behavior="height">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {overlay}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Room at the bottom so the activity pill (APP-14) never hides the last item.
  content: { padding: space.xl, paddingBottom: 96, gap: space.lg, flexGrow: 1 },
});
