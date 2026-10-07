import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { absoluteUrl } from '../lib/config';
import { initials } from '../lib/format';
import { avatarColor, colors, fonts } from '../theme';
import { AppText } from './AppText';

type Props = {
  name: string;
  photoUrl?: string | null;
  localUri?: string | null;
  size?: number;
  online?: boolean;
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Avatar({ name, photoUrl, localUri, size = 56, online, ring, style }: Props) {
  const uri = localUri ?? absoluteUrl(photoUrl);
  const dot = Math.max(14, Math.round(size * 0.24));
  return (
    <View
      style={[{ width: size, height: size }, style]}
      accessibilityRole="image"
      accessibilityLabel={online ? `${name}, online now` : name}
    >
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: avatarColor(name),
            borderWidth: ring ? 3 : 0,
          },
        ]}
      >
        {uri ? (
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} />
        ) : (
          <AppText
            scale={false}
            style={{ fontFamily: fonts.heavy, fontSize: size * 0.38, lineHeight: size * 0.46 }}
            color={colors.text}
          >
            {initials(name)}
          </AppText>
        )}
      </View>
      {online ? (
        <View
          style={[
            styles.dot,
            { width: dot, height: dot, borderRadius: dot / 2, right: size * 0.02, bottom: size * 0.02 },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderColor: colors.white,
  },
  dot: {
    position: 'absolute',
    backgroundColor: colors.online,
    borderWidth: 3,
    borderColor: colors.white,
  },
});
