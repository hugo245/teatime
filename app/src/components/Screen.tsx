import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '../theme';
import { AppText } from './AppText';

type Props = {
  title?: string;
  subtitle?: string;
  back?: boolean;
  scroll?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  right?: ReactNode;
  onTitlePress?: () => void;
};

export function Screen({ title, subtitle, back, scroll = true, children, footer, refreshing, onRefresh, contentStyle, right, onTitlePress }: Props) {
  const insets = useSafeAreaInsets();
  const header = (
    <View style={styles.header}>
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={28} color={colors.primary} />
          <AppText variant="bodyStrong" color={colors.primary}>
            Back
          </AppText>
        </Pressable>
      ) : null}
      {title ? (
        <View style={styles.titleRow}>
          <AppText variant="display" accessibilityRole="header" style={{ flex: 1 }} onPress={onTitlePress} suppressHighlighting>
            {title}
          </AppText>
          {right}
        </View>
      ) : null}
      {subtitle ? (
        <AppText variant="body" color={colors.textMuted} style={{ marginTop: 4 }}>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: footer ? space.xl : space.xxl + 8 }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }, contentStyle]}>
          {header}
          {children}
        </View>
      )}
      {footer ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: space.page,
  },
  header: {
    paddingTop: space.lg,
    paddingBottom: space.xl,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -8,
    marginBottom: space.md,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingRight: 8,
  },
  footer: {
    paddingHorizontal: space.page,
    paddingTop: space.md,
    gap: space.md,
    backgroundColor: colors.bg,
  },
});
