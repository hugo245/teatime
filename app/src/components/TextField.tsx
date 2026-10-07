import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useTextScale } from '../state/settings';
import { colors, fonts, radius } from '../theme';
import { AppText } from './AppText';

type Props = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  multiline?: boolean;
};

export const TextField = forwardRef<TextInput, Props>(function TextField({ label, hint, error, multiline, style, ...rest }, ref) {
  const [focused, setFocused] = useState(false);
  const scale = useTextScale();
  return (
    <View style={{ gap: 8 }}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textFaint}
        multiline={multiline}
        maxFontSizeMultiplier={1.4}
        accessibilityLabel={label}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={[
          styles.input,
          {
            fontSize: Math.round(22 * scale),
            minHeight: multiline ? 130 : 64,
            textAlignVertical: multiline ? 'top' : 'center',
            borderColor: error ? colors.danger : focused ? colors.primary : colors.border,
          },
          style,
        ]}
      />
      {error ? (
        <AppText variant="caption" color={colors.danger}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color={colors.textMuted}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  input: {
    fontFamily: fonts.semibold,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
});
