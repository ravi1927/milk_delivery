import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import AppLogo from '../components/AppLogo';
import { BUSINESS } from '../constants/business';
import { colors } from '../constants/theme';

// Branded loading screen shown while the app starts (then redirects to login / dashboard).
export default function Index() {
  const { user, loading } = useAuth();
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();
  }, []);

  if (!loading) return <Redirect href={user ? (user.role === 'admin' ? '/admin' : '/delivery') : '/login'} />;

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.center, { opacity: fade, transform: [{ scale }] }]}>
        <AppLogo size={170} radius={38} />
        <Text style={styles.name}>{BUSINESS.name}</Text>
        <Text style={styles.tag}>{BUSINESS.tagline}</Text>
      </Animated.View>
      <View style={styles.loader}><ActivityIndicator color={colors.primary} /><Text style={styles.loading}>Loading…</Text></View>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center' },
  name: { marginTop: 22, fontSize: 28, fontWeight: '900', color: colors.primaryDark },
  tag: { marginTop: 4, color: colors.secondaryDark, fontWeight: '700' },
  loader: { position: 'absolute', bottom: 70, alignItems: 'center', gap: 8 },
  loading: { color: colors.muted, fontSize: 12 },
});
