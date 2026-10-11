import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as s from '../services/store';

const AuthCtx = createContext({ user: null, loading: true, signIn: async () => null, signOut: async () => {} });

const MIN_SPLASH_MS = 1400; // keep the branded loading screen visible long enough to look intentional

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const wait = new Promise((r) => setTimeout(r, MIN_SPLASH_MS));
      let u = null;
      try {
        await s.bootstrap();
        u = await s.session();
      } catch (e) {
        console.warn('Startup error', e);
        u = null;
      }
      await wait;
      if (alive) { setUser(u); setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const u = await s.login(email, password);
    if (u) {
      try { await s.bootstrap(); } catch (e) { console.warn('Post-login bootstrap', e); }
    }
    setUser(u);
    return u;
  }, []);

  const signOut = useCallback(async () => {
    try { await s.logout(); } finally { setUser(null); }
  }, []);

  const value = useMemo(() => ({ user, loading, signIn, signOut }), [user, loading, signIn, signOut]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
