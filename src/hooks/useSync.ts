import { useCallback, useEffect, useRef, useState } from 'react';
import type { Provider, Session } from '@supabase/supabase-js';
import { store } from '../lib/store';
import { supabase } from '../lib/sync/supabaseClient';
import { SupabaseRemote } from '../lib/sync/supabaseRemote';
import { syncOnce } from '../lib/sync/sync';

/** 화면이 동기화 후 데이터를 다시 읽도록 알리는 이벤트 */
export const SYNCED_EVENT = 'pdf-memorize:synced';
const INTERVAL_MS = 5 * 60_000;

export type SyncStatus = 'disabled' | 'signedOut' | 'idle' | 'syncing' | 'error';

export interface SyncState {
  status: SyncStatus;
  email?: string;
  lastSyncedAt?: Date;
  error?: string;
  signIn: (provider: Provider) => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
}

/**
 * 로그인 상태와 동기화. 로그인 직후, 5분마다, 탭이 다시 보일 때, 온라인 복귀 시, 그리고 syncNow 호출 시 동기화한다.
 */
export function useSync(): SyncState {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SyncStatus>(supabase ? 'signedOut' : 'disabled');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date>();
  const [error, setError] = useState<string>();
  const running = useRef(false);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const syncNow = useCallback(async () => {
    if (!supabase || !session || running.current) return;
    running.current = true;
    setStatus('syncing');
    try {
      const result = await syncOnce(store, new SupabaseRemote(supabase, session.user.id));
      setLastSyncedAt(new Date());
      setError(undefined);
      setStatus('idle');
      if (result.pulled > 0) window.dispatchEvent(new Event(SYNCED_EVENT));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    } finally {
      running.current = false;
    }
  }, [session]);

  useEffect(() => {
    if (!supabase) return;
    if (!session) {
      setStatus('signedOut');
      return;
    }
    void syncNow();
    const timer = setInterval(() => void syncNow(), INTERVAL_MS);
    const onVisible = () => document.visibilityState === 'visible' && void syncNow();
    const onOnline = () => void syncNow();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [session, syncNow]);

  const signIn = useCallback(async (provider: Provider) => {
    if (!supabase) return;
    const { error: e } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });
    if (e) {
      setError(e.message);
      setStatus('error');
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    // 로컬 학습 데이터는 남기고 동기화 커서만 지운다. 다른 계정으로 로그인하면 로컬 데이터가 그 계정에 올라간다 (결정 대기 D17)
    await store.resetSyncState();
  }, []);

  return { status, email: session?.user.email ?? undefined, lastSyncedAt, error, signIn, signOut, syncNow };
}
