# pdf-memorize

PDF에서 하이라이트한 부분을 뽑아 암기 카드로 학습하게 돕는 웹 서비스. 1인 개발 개인 프로젝트.

## 현재 상태

- 완료: 하이라이트 추출 프로토타입 (`src/lib/extractHighlights.ts`), 추출 결과 목록 화면 (`src/App.tsx`)
- 다음: 한 글자 두문자를 문장 단위로 묶기, 암기 카드 화면, Supabase 연동(로그인·동기화)

## 지원 범위

- 지원: HWP/Word에서 글자 배경색(형광펜)을 넣고 PDF로 변환한 파일. 텍스트가 살아 있어야 함
- 미지원: PDF 뷰어 앱(굿노트, 아크로뱃 등)의 Highlight 주석, 스캔본(이미지 PDF). 주석은 개수만 표시

## 아키텍처 결정

- PDF는 브라우저에서만 처리하고 서버로 보내거나 저장하지 않는다. 저작권·개인정보 부담과 서버 비용을 없애기 위함
- 호스팅: Cloudflare Pages (정적). Vercel Hobby는 상업적 사용 금지라 제외
- 백엔드: Supabase 서울 리전 (Auth: Kakao/Google OAuth, Postgres + RLS). 별도 서버 없음. LLM 기능이 생기면 Edge Functions 추가
- DB에는 추출 텍스트·카드·복습 기록만 저장. 원본 PDF는 저장하지 않음
- 복습 알고리즘: FSRS (`ts-fsrs`) 예정

## 하이라이트 추출 원리

HWP/Word 배경색은 PDF 주석이 아니라 글자 뒤에 그려진 색 사각형이다.

1. `page.getOperatorList()`를 따라가며 CTM(save/restore/transform)을 추적하고, 밝은 유채색으로 채운 경로의 bbox를 모은다
2. `getTextContent()` 아이템을 글자 단위로 나눠 글자 중심점이 들어가는 사각형의 색을 판정한다. 겹치면 나중에 그린 사각형이 이긴다
3. 붙어 있는 하이라이트 글자는 색이 달라도 한 문구로 합친다. 공백과 줄바꿈은 이어 붙인다

주의할 점:
- 노란색(255,255,0)은 두문자 표시다. 문구 배경 위에 첫 글자만 노랗게 칠하는 패턴이라 `keyLetters`로 따로 기록한다
- 회색(표 음영), 흰색, 진한 색(글자색·제목 배경)은 하이라이트가 아니다 (`isHighlightColor`)
- 글자 폭을 텍스트 아이템 폭 ÷ 글자 수로 추정한다. 한글처럼 폭이 고른 글꼴에서는 맞지만, 비례폭 영문은 경계가 한두 글자 어긋날 수 있다
- 한 글자 하이라이트(두문자만 칠한 경우)가 많다. 현재는 화면에서 기본 숨김

## 명령어

```
npm run dev        # 개발 서버
npm run test       # vitest (Node, pdf.js legacy 빌드로 alias)
npm run typecheck
npm run lint
npm run build
```

변경 후에는 `typecheck`, `lint`, `test`를 통과시킨 뒤 커밋한다.

## 테스트

- `src/lib/extractHighlights.test.ts`: pdf-lib로 HWP 구조를 흉내 낸 PDF를 테스트 안에서 생성한다. 고정폭 폰트(Courier) 사용
- `src/lib/extractHighlights.sample.test.ts`: 실제 샘플 PDF 회귀 테스트. `fixtures/local/sample.pdf`가 있을 때만 실행
- **공개 저장소다.** `fixtures/local/`(저작물 PDF)은 gitignore 대상이며 절대 커밋하지 않는다
- 추출 로직을 바꾸면 샘플 테스트 기대값이 실제 렌더링과 맞는지 다시 확인한다

## 커밋·Git

- Conventional Commits, 제목은 한글: `feat: 암기 카드 화면 추가`. 본문은 개조식
- type: feat / fix / refactor / test / docs / chore / style / perf
- 트레일러는 `Co-Authored-By: Claude ...`만 쓴다. `Claude-Session` 줄은 넣지 않는다
- 이 저장소만 개인 GitHub 계정(rlarltj)을 쓴다. repo-local `user.email`과 `core.sshCommand`가 설정되어 있으니 바꾸지 않는다

## 코드 규칙

- TypeScript strict. `any` 대신 pdf.js 타입 사용
- 주석은 "왜"를 한국어로 짧게. 코드가 하는 일을 반복하지 않는다
- pdf.js 워커 설정은 `src/lib/pdfWorker.ts`(브라우저 전용)에만 둔다. 추출 로직은 Node 테스트에서도 import되므로 브라우저 전용 코드를 넣지 않는다
