import type { ColorValue } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

interface IconProps {
  color: ColorValue;
  size?: number;
}

/** Paw print: the Search tab and the indexer-budget icon. */
export function PawIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Ellipse cx={12} cy={16} rx={5} ry={4} />
      <Circle cx={6} cy={10} r={2} />
      <Circle cx={10} cy={6.5} r={2} />
      <Circle cx={14} cy={6.5} r={2} />
      <Circle cx={18} cy={10} r={2} />
    </Svg>
  );
}

export function BooksIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinejoin="round"
    >
      <Path d="M4 4H8V20H4Z" />
      <Path d="M10 4H14V20H10Z" />
      <Path d="M16 5L19.5 4L22 19L18.5 20Z" />
    </Svg>
  );
}

/** Ball of yarn: requests in progress. */
export function YarnIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
    >
      <Circle cx={12} cy={12} r={8} />
      <Path d="M6 9Q12 12 18 9M5 14Q12 17 19 14M10 4Q8 12 11 20" />
    </Svg>
  );
}

export function SlidersIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
    >
      <Path d="M4 7H14M18 7H20M4 17H8M12 17H20" />
      <Circle cx={16} cy={7} r={2} />
      <Circle cx={10} cy={17} r={2} />
    </Svg>
  );
}
