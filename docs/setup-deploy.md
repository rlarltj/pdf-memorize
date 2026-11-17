# 배포 (Cloudflare Workers 정적 자산)

Cloudflare Pages가 Workers로 통합되어 새 wrangler는 Pages 프로젝트 생성을 Workers로 넘긴다 (2026-11-18 확인).
그래서 Worker 스크립트 없이 `dist`만 올리는 Workers 정적 자산 방식을 쓴다. 정적 자산 요청은 무료·무제한이다.

## 구조

- `wrangler.toml`: 이름 `pdf-memorize`, `[assets] directory = "./dist"`, SPA 404 처리
- 주소: https://pdf-memorize.pdf-memorize.workers.dev
- 로컬 배포: `npm run deploy`. 처음 한 번 `npx wrangler login`. Node 22 이상 필요
- 자동 배포: main push → `check` 통과 → `deploy` 잡. 아래 Secrets가 없으면 배포 단계만 건너뜀

## 처음 한 번

- Cloudflare 계정 이메일 인증이 되어 있어야 Workers를 만들 수 있다 (`code: 10034`)
- workers.dev 서브도메인이 없으면 대시보드 Workers & Pages에서 한 번 열어 등록

## 자동 배포 켜기

1. Cloudflare 대시보드 > My Profile > API Tokens > Create Token > "Edit Cloudflare Workers" 템플릿
2. 계정 ID: `npx wrangler whoami`
3. GitHub 저장소 Settings > Secrets and variables > Actions
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
   - Variables(공개 값): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (동기화를 켤 때만)

## 주의

- Supabase 값은 빌드 시점에 번들에 들어간다. 바꾸면 재배포해야 반영된다
- 로컬에서 `npm run deploy`할 때 `.env.local`의 Supabase 값이 들어간다
