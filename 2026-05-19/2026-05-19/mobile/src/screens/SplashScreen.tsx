import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Image, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

export default function SplashScreen() {
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const waveY = useRef(new Animated.Value(120)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, useNativeDriver: true, tension: 50, friction: 8 }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(waveY, { toValue: 0, useNativeDriver: true, tension: 40, friction: 10 }),
      ]),
      Animated.timing(textOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      {/* Logo + title */}
      <View style={styles.centerContent}>
        <Animated.View
          style={[
            styles.logoBox,
            { transform: [{ scale: logoScale }], opacity: logoOpacity },
          ]}
        >
          <Image
            source={require('../assets/farmley mobile app logo.jpg')}
            style={styles.logo}
            resizeMode="cover"
          />
        </Animated.View>

        <Animated.Text style={[styles.appName, { opacity: textOpacity }]}>
          Farmley SFA
        </Animated.Text>
        <Animated.Text style={[styles.subtitle, { opacity: textOpacity }]}>
          Sales Force Automation
        </Animated.Text>
      </View>

      {/* Blue wave at bottom */}
      <Animated.View
        style={[styles.wave, { transform: [{ translateY: waveY }] }]}
      />

      <Text style={styles.version}>v2.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerContent: {
    alignItems: 'center',
    marginBottom: 60,
  },
  logoBox: {
    width: 130,
    height: 130,
    borderRadius: 32,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  logo: {
    width: 130,
    height: 130,
  },
  appName: {
    fontSize: 30,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  wave: {
    position: 'absolute',
    bottom: 0,
    left: -width * 0.5,
    width: width * 2,
    height: 160,
    borderRadius: 300,
    backgroundColor: '#1a56db',
  },
  version: {
    position: 'absolute',
    bottom: 32,
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 1,
    fontWeight: '600',
  },
});
