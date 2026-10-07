import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { colors, space } from '../theme';
import { AppText } from './AppText';
import { Screen } from './Screen';

type Props = {
  step: number;
  total?: number;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  footer: ReactNode;
};

export function OnboardingStep({ step, total = 6, title, subtitle, children, footer }: Props) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen back footer={footer}>
        <View style={styles.progress} accessibilityLabel={`Step ${step} of ${total}`}>
          {Array.from({ length: total }, (_, i) => (
            <View key={i} style={[styles.dot, i < step && styles.dotDone, i === step - 1 && styles.dotCurrent]} />
          ))}
        </View>
        <AppText variant="caption" color={colors.textMuted}>
          Step {step} of {total}
        </AppText>
        <AppText variant="display" accessibilityRole="header" style={{ marginTop: 6 }}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="body" color={colors.textMuted} style={{ marginTop: 10 }}>
            {subtitle}
          </AppText>
        ) : null}
        <View style={{ marginTop: space.xl }}>{children}</View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  progress: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  dot: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotDone: {
    backgroundColor: colors.primary,
  },
  dotCurrent: {
    backgroundColor: colors.primary,
  },
});
