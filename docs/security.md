# 보안 점검

마지막 점검: 2026-11-18. 구조가 바뀌면(서버 코드 추가, 파일 업로드 저장 등) 이 문서부터 다시 본다.

## 구조상 전제

- 서버 코드가 없다. Cloudflare는 정적 파일만 제공하고, 데이터 API는 Supabase(PostgREST + RLS)다
- PDF는 브라우저에서만 처리하고 어디에도 업로드하지 않는다
- 인증은 Supabase Auth(OAuth, PKCE). 토큰은 브라우저 저장소에 있고 쿠키 세션을 쓰지 않는다

## 위협별 상태

| 위협 | 상태 | 근거 |
|---|---|---|
| SSRF | 해당 없음 | 서버가 사용자 입력으로 외부 요청을 보내는 코드가 없다. Edge Function을 추가하면 다시 점검 |
| CSRF | 해당 없음 | 쿠키 인증이 아니라 요청마다 `Authorization` 헤더에 토큰을 붙인다. 다른 사이트가 이 헤더를 대신 붙일 수 없다 |
| XSS | 방어 | React가 모든 텍스트를 이스케이프. `dangerouslySetInnerHTML`·`innerHTML`·`eval` 사용 없음. PDF·동기화로 들어온 문구도 텍스트로만 그린다. CSP `script-src 'self'`로 외부·인라인 스크립트 차단 |
| 토큰 탈취 | 완화 | XSS 방어가 1차. OAuth는 PKCE라 토큰이 URL에 노출되지 않는다 |
| 다른 사용자 데이터 접근 | 방어 | 모든 테이블 RLS `auth.uid() = user_id`, 정책은 `authenticated`에만. anon은 테이블 권한 자체를 revoke. PGlite로 위장 쓰기·조회·anon 접근이 거부되는 것 확인 |
| 저장 공간 남용 | 완화 | 컬럼 크기·형식 check (문서 id는 SHA-256 형식, 카드 내용 16KB, 일정 2KB). 사용자당 행 수 제한은 없음 (결정 대기 D22) |
| 악성 PDF | 완화 | pdf.js 4.10(폰트 코드 실행 CVE-2024-4367 수정 버전 이후), `isEvalSupported: false`, CSP가 eval 차단. 파싱은 사용자 자신의 브라우저에서만 일어난다. 100MB 초과 파일 거부 |
| 클릭재킹 | 방어 | CSP `frame-ancestors 'none'` |
| 오픈 리다이렉트 | 설정 필요 | OAuth `redirectTo`는 현재 origin. Supabase Redirect URLs 허용 목록에 배포 주소·localhost만 넣는다 (`docs/setup-supabase.md`) |
| 비밀 값 유출 | 방어 | 클라이언트에는 공개용 publishable 키만. `service_role` 키는 어디에도 쓰지 않는다. `.env*`는 gitignore, Cloudflare 토큰은 GitHub Secrets |
| CI 공급망 | 완화 | 외부 Action을 커밋 SHA로 고정, `GITHUB_TOKEN`은 `contents: read`. PR(포크 포함)에서는 배포 잡이 돌지 않아 Secrets에 접근 불가 |
| 의존성 취약점 | 점검 | 운영 번들 의존성 `npm audit --omit=dev` 0건. 개발 도구는 picomatch ReDoS(패치 없음, 우리 설정의 glob만 처리해 악용 경로 없음)만 남음 |

## 변경할 때 지킬 것

- 사용자 입력이나 PDF 내용을 HTML로 넣지 않는다. 필요하면 sanitizer와 함께 이 문서를 갱신
- 새 테이블은 RLS를 켜고 `to authenticated` 정책 + 크기 check를 같이 만든다
- Edge Function·Worker 스크립트를 추가하면 SSRF(사용자가 준 URL로 요청), 비밀 값 노출, CORS를 다시 점검
- CSP를 넓혀야 하면(외부 스크립트 등) 이유를 `public/_headers` 주석에 남긴다
