import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';
import { AppText } from './AppText';

export function CatFace({ size = 28, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none" accessibilityElementsHidden>
      <Path
        d="M6 13L6 4L12 9Q16 8 20 9L26 4L26 13Q28 18 26 22Q22 28 16 28Q10 28 6 22Q4 18 6 13Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={17} r={1.3} fill={color} />
      <Circle cx={20} cy={17} r={1.3} fill={color} />
      <Path d="M15 21L16 22L17 21" stroke={color} strokeWidth={2} />
      <Path d="M2 19L9 20M2 23L9 22M30 19L23 20M30 23L23 22" stroke={color} strokeWidth={2} />
    </Svg>
  );
}

export function Logo() {
  const { colors } = useTheme();
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="Purrshelf">
      <CatFace color={colors.accent} />
      <AppText style={[styles.word, { color: colors.text }]}>Purrshelf</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  word: { fontFamily: fonts.heading, fontSize: 18 },
});
