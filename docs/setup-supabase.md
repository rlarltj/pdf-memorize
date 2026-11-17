# Supabase 설정 (로그인·동기화)

환경 변수를 넣지 않으면 앱은 로그인 없이 로컬 전용으로 동작한다. 아래는 동기화를 켤 때의 절차다.

## 1. 프로젝트 생성

- **개인 계정**으로 만든다. 회사 Supabase 조직은 쓰지 않는다
- 리전: Northeast Asia (Seoul) `ap-northeast-2`
- 무료 플랜은 7일간 요청이 없으면 일시정지된다 (ADR 2026-11-18-hosting-cloudflare-pages-supabase)

## 2. 스키마 적용

둘 중 하나를 고른다.

- 대시보드 SQL Editor에 `supabase/migrations/20261118000000_init.sql` 내용을 붙여 실행
- Supabase CLI: `supabase link --project-ref <ref>` 후 `supabase db push`

적용 후 Table Editor에서 `documents`, `cards`, `reviews` 세 테이블에 RLS가 켜져 있는지 확인한다.

## 3. 로그인 수단

Authentication > Sign In / Providers

- **Kakao**: Kakao Developers에서 앱 생성 → 카카오 로그인 활성화 → Redirect URI에 `https://<ref>.supabase.co/auth/v1/callback` 등록 → REST API 키와 Client Secret을 Supabase에 입력. 동의 항목에서 이메일은 선택 사항이라 비어 있을 수 있다
- **Google**: Google Cloud Console에서 OAuth 클라이언트(웹) 생성 → 승인된 리디렉션 URI에 위와 같은 callback 등록 → Client ID/Secret 입력

Authentication > URL Configuration

- Site URL: 배포 주소 (예: `https://pdf-memorize.pages.dev`)
- Redirect URLs: 배포 주소, `http://localhost:5173` (로컬 개발)

## 4. 환경 변수

Project Settings > API의 값을 넣는다. 둘 다 공개되어도 되는 값이고 권한은 RLS가 막는다. `service_role` 키는 절대 넣지 않는다.

- 로컬: `.env.local` (gitignore 대상)
  ```
  VITE_SUPABASE_URL=https://<ref>.supabase.co
  VITE_SUPABASE_PUBLISHABLE_KEY=<publishable 또는 anon 키>
  ```
- Cloudflare Pages: Settings > Environment variables에 같은 이름으로 추가 후 재배포 (빌드 시점에 번들에 들어감)

## 동기화 동작

- 로컬(IndexedDB)이 기본 저장소. 로그인 직후, 5분마다, 탭 복귀·온라인 복귀 시, 홈으로 돌아올 때 동기화
- 문서·카드: 클라이언트 `updated_at` 기준 더 최근 것이 이김. 커서는 서버 시각 `server_updated_at`
- 삭제: `deleted_at`으로 표시해 다른 기기에 전파. 삭제 뒤 같은 PDF를 다시 올리면 되살아남
- 복습 기록: 클라이언트 UUID로 중복 없이 추가만
- 원본 PDF는 올리지 않는다
