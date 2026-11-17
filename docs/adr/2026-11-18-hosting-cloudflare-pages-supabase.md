# 호스팅은 Cloudflare Pages, 백엔드는 Supabase를 쓴다

- 상태: 채택 (Supabase 연동은 미착수)
- 날짜: 2026-11-18

## 배경

1인 개발, 비용 최소화가 목표다. 로그인과 기기 간 학습 기록 동기화가 필요하지만 무거운 서버 로직은 없다.

## 결정

- 프론트: Cloudflare 정적 호스팅. 처음엔 Pages로 정했으나 Pages가 Workers로 통합되어 Workers 정적 자산으로 배포 (2026-11-18 갱신)
- 인증·DB: Supabase 서울 리전. Auth(Kakao/Google OAuth), Postgres + RLS
- 별도 API 서버는 두지 않는다. LLM 등 비밀 키가 필요한 기능이 생기면 Supabase Edge Functions 또는 Cloudflare Workers를 추가한다
- GitHub는 개인 저장소 하나에 프론트와 `supabase/`(마이그레이션, 함수)를 함께 둔다. 협업자나 저장소가 늘면 Organization으로 transfer

## 이유

- Cloudflare Pages는 대역폭 무제한 무료이고 상업적 사용이 가능하다. Vercel Hobby는 상업적 사용 금지, GitHub Pages는 서비스 운영 용도에 맞지 않는다
- Supabase는 Postgres라 `pg_dump`로 데이터를 옮길 수 있어 lock-in이 약하다. Kakao OAuth가 내장되어 있다
- 저장 데이터가 사용자당 수십~수백 KB라 무료·Pro 플랜으로 오래 버틴다

## 감수하는 것

- Supabase 무료 플랜은 7일간 요청이 없으면 일시정지된다. 실제 운영 시 Pro($25/월) 검토
- 프론트가 DB를 직접 호출하고 RLS로 권한을 거는 구조라, Supabase를 떠나면 이 부분은 다시 작성해야 한다
- Storage에 파일을 두면 egress 과금이 있다. 원본 보관이 필요해지면 Cloudflare R2를 쓴다
