import Svg, { Circle, Ellipse } from 'react-native-svg';

/** The paw print used by the loader and the Delivered confetti. */
export function PawPrint({ color, size }: { color: string; size: number }) {
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
