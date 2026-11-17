import type { SyncState } from '../hooks/useSync';

const time = (d: Date) => d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

/** 로그인·동기화 상태. Supabase 설정이 없으면 아무것도 그리지 않는다 */
export function AuthBar({ sync }: { sync: SyncState }) {
  if (sync.status === 'disabled') return null;

  if (sync.status === 'signedOut') {
    return (
      <div className="auth-bar">
        <span className="hint">로그인하면 다른 기기와 학습 기록이 동기화됩니다.</span>
        <div className="row-actions">
          <button className="kakao" onClick={() => sync.signIn('kakao')}>카카오로 로그인</button>
          <button onClick={() => sync.signIn('google')}>Google로 로그인</button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-bar">
      <span className="hint">
        {sync.email}
        {' · '}
        {sync.status === 'syncing' && '동기화 중...'}
        {sync.status === 'idle' && (sync.lastSyncedAt ? `${time(sync.lastSyncedAt)} 동기화됨` : '동기화 대기')}
        {sync.status === 'error' && <span className="error">동기화 실패: {sync.error}</span>}
      </span>
      <div className="row-actions">
        <button onClick={() => sync.syncNow()} disabled={sync.status === 'syncing'}>지금 동기화</button>
        <button className="link" onClick={() => sync.signOut()}>로그아웃</button>
      </div>
    </div>
  );
}
