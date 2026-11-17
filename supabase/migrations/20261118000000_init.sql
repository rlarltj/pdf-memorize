-- 학습 데이터 동기화용 테이블. 원본 PDF는 저장하지 않는다 (docs/adr/2026-11-18-pdf-client-side-only.md)
-- 로컬(IndexedDB)이 기본 저장소이고, 이 테이블은 기기 간 동기화 대상이다.
-- 삭제는 deleted_at으로 표시해 다른 기기에도 전파한다.
-- 크기 제한(check)은 저장 공간 남용을 막기 위함. 실제 카드 한 장은 1KB 안팎이다.
-- updated_at은 클라이언트 시각으로 충돌 판정(last-write-wins)에 쓰고,
-- server_updated_at은 서버 시각으로 pull 커서에 쓴다. 기기 시계가 어긋나거나 오프라인 수정을 늦게 올려도 놓치지 않게 하기 위함.

create table public.documents (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (id ~ '^[0-9a-f]{64}$'),   -- 파일 SHA-256
  name text not null check (char_length(name) <= 500),
  num_pages int not null check (num_pages between 0 and 100000),
  highlight_count int not null check (highlight_count between 0 and 1000000),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.cards (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 200),  -- `${documentId}:${page}:${문구 해시}:${type}`
  document_id text not null check (char_length(document_id) <= 64),
  content jsonb not null check (pg_column_size(content) <= 16384),  -- 문구·문맥·두문자 등 카드 내용
  schedule jsonb not null check (pg_column_size(schedule) <= 2048), -- FSRS 상태
  suspended boolean not null default false,
  edited boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.reviews (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id uuid not null,                       -- 클라이언트가 만든 UUID. 재전송해도 중복되지 않게
  card_id text not null check (char_length(card_id) <= 200),
  document_id text not null check (char_length(document_id) <= 64),
  grade smallint not null check (grade between 1 and 4),
  previous_state smallint not null,
  reviewed_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create function public.touch_server_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.server_updated_at = now();
  return new;
end;
$$;

create trigger documents_touch before insert or update on public.documents
  for each row execute function public.touch_server_updated_at();
create trigger cards_touch before insert or update on public.cards
  for each row execute function public.touch_server_updated_at();
create trigger reviews_touch before insert or update on public.reviews
  for each row execute function public.touch_server_updated_at();

-- pull: "내 행 중 server_updated_at > 커서"
create index documents_user_server_updated on public.documents (user_id, server_updated_at);
create index cards_user_server_updated on public.cards (user_id, server_updated_at);
create index reviews_user_server_updated on public.reviews (user_id, server_updated_at);

alter table public.documents enable row level security;
alter table public.cards enable row level security;
alter table public.reviews enable row level security;

-- 로그인 사용자만, 자기 행만. anon에는 정책이 없어 RLS가 모두 막는다
create policy "own documents" on public.documents for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own cards" on public.cards for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own reviews" on public.reviews for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- 이중 방어: anon 역할의 테이블 권한 자체를 뺀다
revoke all on public.documents, public.cards, public.reviews from anon;
