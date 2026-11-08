import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/** Two small triangles that sit on top of the search field, covers and sheets. */
export function CatEars({ color, width = 64 }: { color: string; width?: number }) {
  return (
    <View pointerEvents="none" style={styles.wrap} accessibilityElementsHidden>
      <Svg width={width} height={14} viewBox="0 0 64 14">
        <Path d="M4 14L12 1L20 14Z M44 14L52 1L60 14Z" fill={color} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: -12, left: 24 },
});
