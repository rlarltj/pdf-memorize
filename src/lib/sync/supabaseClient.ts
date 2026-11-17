import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// publishable key(sb_publishable_...) 또는 기존 anon key. 둘 다 공개되어도 되는 키이고 권한은 RLS로 막는다
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** 환경 변수가 없으면 null. 로그인 UI를 숨기고 로컬 전용으로 동작한다 */
// PKCE: OAuth 완료 시 토큰 대신 일회용 코드가 URL로 돌아온다. 토큰이 주소창·기록·Referer에 남지 않게 하기 위함
export const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { flowType: 'pkce' } }) : null;
