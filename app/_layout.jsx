import React, { useEffect } from 'react';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../context/AuthContext';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Sends the user to the right place whenever login state changes. This is also what makes
// Logout reliable: as soon as the session is cleared the app returns to the login screen.
function AuthGate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const nav = useRootNavigationState();
  const first = segments[0];

  useEffect(() => { SplashScreen.hideAsync().catch(() => {}); }, []);

  useEffect(() => {
    if (!nav?.key || loading) return;
    if (!user) { if (first !== 'login') router.replace('/login'); return; }
    const home = user.role === 'admin' ? '/admin' : '/delivery';
    if (first === 'login') router.replace(home);
    else if (first === 'admin' && user.role !== 'admin') router.replace('/delivery');
  }, [user, loading, first, nav?.key]);

  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
