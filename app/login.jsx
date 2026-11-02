import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import AppLogo from '../components/AppLogo';
import { Field, PrimaryButton } from '../components/Field';
import { BUSINESS } from '../constants/business';
import { colors } from '../constants/theme';
import { homeForRole } from '../services/roles';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    if (busy) return;
    const trimmed = email.trim();
    if (!trimmed || !password) {
      Alert.alert('Sign in', 'Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      const u = await signIn(trimmed, password);
      if (!u) return Alert.alert('Login failed', 'Please check your email and password.');
      router.replace(homeForRole(u.role));
    } catch (e) {
      Alert.alert('Login failed', e?.message || 'Could not reach the server.');
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <AppLogo size={128} radius={30} />
          <Text style={styles.title}>{BUSINESS.name}</Text>
          <Text style={styles.subtitle}>Smart daily milk delivery management</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign in</Text>
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="Enter email" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" placeholder="Enter password" />
          <PrimaryButton title={busy ? 'Signing in…' : 'Sign In'} onPress={handleLogin} disabled={busy} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  brand: { alignItems: 'center', marginBottom: 22, width: '100%', maxWidth: 480 },
  title: { textAlign: 'center', color: colors.text, fontSize: 28, fontWeight: '900', marginTop: 14, paddingHorizontal: 8 },
  subtitle: { textAlign: 'center', color: colors.muted, marginTop: 4, paddingHorizontal: 12, lineHeight: 20 },
  card: { width: '100%', maxWidth: 480, backgroundColor: colors.card, borderRadius: 24, padding: 22, borderWidth: 1, borderColor: colors.border, shadowColor: colors.shadow, shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  cardTitle: { fontSize: 18, fontWeight: '900', color: colors.text, marginBottom: 14 },
});
