import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

export function Pulse({ size, color, children }: { size: number; color: string; children: ReactNode }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  const ring = (delay: number) => {
    const value = Animated.modulo(Animated.add(progress, delay), 1);
    return (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
            transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
          },
        ]}
      />
    );
  };

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {ring(0)}
      {ring(0.5)}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
  },
});
