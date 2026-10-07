import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConnection } from '../lib/realtime';
import { useSession } from '../state/session';
import { useUi } from '../state/ui';
import { colors, radius, shadow } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';

export function DialogHost() {
  const dialog = useUi((s) => s.dialog);
  const setDialog = useUi((s) => s.setDialog);
  if (!dialog) return null;
  const close = (value: boolean) => {
    dialog.resolve(value);
    setDialog(null);
  };
  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => close(false)} statusBarTranslucent>
      <View style={styles.scrim}>
        <View style={styles.dialog} accessibilityViewIsModal>
          <AppText variant="title" center accessibilityRole="header">
            {dialog.title}
          </AppText>
          {dialog.message ? (
            <AppText variant="body" color={colors.textMuted} center>
              {dialog.message}
            </AppText>
          ) : null}
          <View style={{ gap: 12, marginTop: 8, alignSelf: 'stretch' }}>
            <Button
              label={dialog.confirmLabel ?? 'Yes'}
              variant={dialog.destructive ? 'danger' : 'primary'}
              onPress={() => close(true)}
            />
            {dialog.cancelLabel !== null ? (
              <Button label={dialog.cancelLabel ?? 'Cancel'} variant="secondary" onPress={() => close(false)} />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function ToastHost() {
  const toast = useUi((s) => s.toast);
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!toast) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [toast, opacity]);

  if (!toast) return null;
  return (
    <View pointerEvents="none" style={[styles.toastWrap, { top: insets.top + 10 }]}>
      <Animated.View
        style={[
          styles.toast,
          { opacity, transform: [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] },
        ]}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        <Ionicons name={toast.icon ?? 'checkmark-circle'} size={24} color={colors.white} />
        <AppText variant="bodyStrong" color={colors.white} style={{ flexShrink: 1 }}>
          {toast.message}
        </AppText>
      </Animated.View>
    </View>
  );
}

export function ConnectionBanner() {
  const status = useConnection((s) => s.status);
  const signedIn = useSession((s) => s.status === 'signedIn');
  const insets = useSafeAreaInsets();
  const [late, setLate] = useState(false);

  useEffect(() => {
    if (status === 'online') {
      setLate(false);
      return;
    }
    const timer = setTimeout(() => setLate(true), 3000);
    return () => clearTimeout(timer);
  }, [status]);

  if (!signedIn || status === 'online' || !late) return null;
  return (
    <View pointerEvents="none" style={[styles.bannerWrap, { top: insets.top + 6 }]}>
      <View style={styles.banner}>
        <Ionicons name="cloud-offline-outline" size={18} color={colors.text} />
        <AppText variant="caption">Connecting to TeaTime</AppText>
      </View>
    </View>
  );
}

export function Sheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheetScrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) + 8 }]}>
          <View style={styles.grabber} />
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 24,
    gap: 12,
    alignItems: 'center',
    ...shadow.raised,
  },
  toastWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 100,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.text,
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    paddingVertical: 14,
    maxWidth: 440,
    ...shadow.raised,
  },
  bannerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 90,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  sheetScrim: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 12,
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginBottom: 8,
  },
});
