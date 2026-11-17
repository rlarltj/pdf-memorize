# pdf-memorize

PDF에서 형광펜으로 칠한 부분을 뽑아 암기 카드로 만들고, 복습 일정(FSRS)에 맞춰 학습하는 웹 앱.

**https://pdf-memorize.pdf-memorize.workers.dev**

- PDF는 브라우저 안에서만 처리하고 서버로 보내지 않는다
- 학습 기록은 브라우저(IndexedDB)에 저장된다. 로그인하면 기기 간 동기화 (Supabase 설정 시)

## 지원하는 PDF

| 형태 | 지원 |
|---|---|
| HWP/Word에서 형광펜·글자 배경색을 넣고 PDF로 저장 | O |
| PDF 뷰어 앱(굿노트, 아크로뱃 등)의 형광펜 주석 | O |
| 스캔본·사진 PDF | X |
| 주석을 병합·평탄화해 내보낸 PDF | X |

문구 첫 글자만 노랗게 칠한 두문자 표시와, 문구 뒤 `[취규불변]` 같은 두문자 괄호를 인식해 두문자 카드를 만든다.

## 개발

Node 22 이상.

```
npm install
npm run dev        # http://localhost:5173
npm run test
npm run typecheck
npm run lint
npm run deploy     # Cloudflare Workers 정적 자산 (wrangler login 필요)
```

main에 push하면 GitHub Actions가 검사 후 자동 배포한다.

## 문서

- `AGENTS.md`: 구조, 추출 원리, 함정, 규칙
- `docs/adr/`: 아키텍처 결정
- `docs/setup-deploy.md`, `docs/setup-supabase.md`: 배포·동기화 설정
- `docs/exec-plans/`: 진행 중인 작업 계획
