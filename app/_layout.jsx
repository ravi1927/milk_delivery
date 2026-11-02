import React, { useEffect } from 'react';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { homeForRole } from '../services/roles';

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
    const home = homeForRole(user.role);
    const onDelivery = first === 'delivery' || first === 'deliver';
    if (!first || first === 'login') router.replace(home);
    else if (user.role === 'admin' && first !== 'admin') router.replace(home);
    else if (user.role === 'customer' && first !== 'customer') router.replace(home);
    else if (user.role !== 'admin' && user.role !== 'customer' && !onDelivery) router.replace(home);
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
