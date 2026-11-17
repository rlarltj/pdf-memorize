# 배포 (Cloudflare Pages)

## 구조

- `wrangler.toml`: Pages 프로젝트 이름 `pdf-memorize`, 출력 디렉터리 `dist`
- 로컬 배포: `npm run deploy` (빌드 후 `wrangler pages deploy`). 처음 한 번 `npx wrangler login` 필요
- 자동 배포: main에 push → `check` 통과 → `deploy` 잡이 배포. 아래 Secrets가 없으면 배포 단계만 건너뜀

## 자동 배포 켜기

1. Cloudflare 대시보드 > My Profile > API Tokens > Create Token > "Edit Cloudflare Workers" 템플릿
   (또는 Custom: Account / Cloudflare Pages / Edit 권한만)
2. 계정 ID: 대시보드 우측 또는 `npx wrangler whoami`
3. GitHub 저장소 Settings > Secrets and variables > Actions
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
   - Variables(공개 값): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (동기화를 켤 때만)

## 주의

- Supabase 값은 빌드 시점에 번들에 들어간다. 바꾸면 재배포해야 반영된다
- Pages 프로젝트를 "Direct Upload"로 만들었으므로 Cloudflare의 Git 연동 빌드는 쓰지 않는다. 빌드는 GitHub Actions가 한다
