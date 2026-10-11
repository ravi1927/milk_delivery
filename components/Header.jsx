import React, { useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import AppLogo from './AppLogo';
import { colors } from '../constants/theme';

const ROOTS = ['/login', '/admin', '/delivery'];

export default function Header({ title, subtitle, back, onRefresh }) {
  const { signOut, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const showBack = back ?? !ROOTS.includes(pathname);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(user?.role === 'admin' ? '/admin' : '/delivery');
  };

  const doLogout = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await signOut(); } finally { busyRef.current = false; setBusy(false); }
    router.replace('/login');
  };
  const confirmLogout = () => {
    if (Platform.OS === 'web') return doLogout();
    Alert.alert('Logout', 'Do you want to log out of the app?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: doLogout },
    ]);
  };

  return (
    <View style={styles.header}>
      <View style={styles.left}>
        {showBack && (
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={goBack} hitSlop={10} style={styles.back}>
            <Ionicons name="chevron-back" size={22} color={colors.primaryDark} />
          </Pressable>
        )}
        <AppLogo size={42} radius={12} />
        <View style={styles.titles}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
        </View>
      </View>
      {onRefresh ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh" onPress={onRefresh} hitSlop={10} style={({ pressed }) => [styles.logout, pressed && { opacity: 0.7 }]}>
          <Ionicons name="refresh" size={18} color={colors.primaryDark} />
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Logout" onPress={confirmLogout} disabled={busy} hitSlop={10} style={({ pressed }) => [styles.logout, pressed && { opacity: 0.7 }]}>
        <Ionicons name="log-out-outline" size={18} color={colors.primaryDark} />
        <Text style={styles.logoutText}>Logout</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 10 },
  left: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, gap: 9 },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.infoBg, alignItems: 'center', justifyContent: 'center' },
  titles: { flex: 1, minWidth: 0 },
  title: { fontSize: 18, fontWeight: '900', color: colors.text },
  subtitle: { color: colors.muted, marginTop: 1, fontSize: 11 },
  logout: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.infoBg, paddingHorizontal: 11, borderRadius: 12 },
  logoutText: { color: colors.primaryDark, fontWeight: '800', fontSize: 13 },
});
