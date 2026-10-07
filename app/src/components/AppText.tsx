import { Text, type TextProps } from 'react-native';
import { useTextScale } from '../state/settings';
import { colors, type, type TypeVariant } from '../theme';

type Props = TextProps & {
  variant?: TypeVariant;
  color?: string;
  center?: boolean;
  scale?: boolean;
};

export function AppText({ variant = 'body', color = colors.text, center, scale = true, style, ...rest }: Props) {
  const factor = useTextScale();
  const base = type[variant];
  const size = scale ? Math.round(base.fontSize * factor) : base.fontSize;
  const lineHeight = scale ? Math.round(base.lineHeight * factor) : base.lineHeight;
  return (
    <Text
      maxFontSizeMultiplier={1.4}
      {...rest}
      style={[base, { fontSize: size, lineHeight, color }, center && { textAlign: 'center' }, style]}
    />
  );
}
