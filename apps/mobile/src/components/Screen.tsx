import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export function Screen({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.fill} behavior="height">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.xl, gap: space.lg, flexGrow: 1 },
});
