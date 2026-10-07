import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFriends } from '../state/friends';
import { colors, fonts, shadow } from '../theme';
import { AppText } from './AppText';

type IconName = ComponentProps<typeof Ionicons>['name'];

const TABS: Record<string, { label: string; icon: IconName; activeIcon: IconName }> = {
  friends: { label: 'Friends', icon: 'people-outline', activeIcon: 'people' },
  index: { label: 'Meet', icon: 'cafe-outline', activeIcon: 'cafe' },
  profile: { label: 'Profile', icon: 'person-circle-outline', activeIcon: 'person-circle' },
};

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const requestCount = useFriends((s) => s.requests.length);

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom - 6, 10) }]}>
      {state.routes.map((route, index) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const focused = state.index === index;
        const center = route.name === 'index';
        const tint = focused ? colors.primary : colors.textMuted;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (Platform.OS !== 'web') void Haptics.selectionAsync();
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };

        const badge = route.name === 'friends' && requestCount > 0 ? requestCount : 0;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={badge ? `${tab.label}, ${badge} new friend request${badge > 1 ? 's' : ''}` : tab.label}
            onPress={onPress}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
          >
            {center ? (
              <View style={[styles.meet, focused ? styles.meetActive : styles.meetIdle]}>
                <Ionicons name={focused ? tab.activeIcon : tab.icon} size={32} color={focused ? colors.white : colors.primary} />
              </View>
            ) : (
              <View style={styles.iconWrap}>
                <Ionicons name={focused ? tab.activeIcon : tab.icon} size={30} color={tint} />
                {badge ? (
                  <View style={styles.badge}>
                    <AppText scale={false} style={styles.badgeText} color={colors.white}>
                      {badge > 9 ? '9+' : String(badge)}
                    </AppText>
                  </View>
                ) : null}
              </View>
            )}
            <AppText
              scale={false}
              variant="label"
              color={tint}
              style={{ fontFamily: focused ? fonts.heavy : fonts.bold, fontSize: 16 }}
            >
              {tab.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 10,
    paddingHorizontal: 12,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    minHeight: 64,
  },
  iconWrap: {
    height: 40,
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meet: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -26,
    borderWidth: 4,
    borderColor: colors.surface,
  },
  meetActive: {
    backgroundColor: colors.primary,
    ...shadow.raised,
  },
  meetIdle: {
    backgroundColor: colors.primarySoft,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 2,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  badgeText: {
    fontFamily: fonts.heavy,
    fontSize: 12,
    lineHeight: 15,
  },
});
