// pdf.js가 텍스트 추출에 쓰는 CMap(한글 CID 폰트 등)과 표준 폰트 데이터를 public/pdfjs로 복사한다.
// 빌드 산출물에 포함되어 같은 출처에서 제공된다. 외부 CDN에 의존하지 않기 위함.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const root = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
const out = 'public/pdfjs';
mkdirSync(out, { recursive: true });
for (const dir of ['cmaps', 'standard_fonts']) cpSync(join(root, dir), join(out, dir), { recursive: true });
console.log(`pdf.js assets → ${out}`);
