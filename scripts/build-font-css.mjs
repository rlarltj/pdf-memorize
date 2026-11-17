// Noto Serif KR(400)의 @font-face를 woff2 전용으로 줄여 src/styles/serif.css로 만든다.
// fontsource 기본 CSS는 규칙마다 woff 대체 경로가 붙어 커진다. 지원 대상 브라우저는 모두 woff2를 읽는다.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { createRequire } from 'node:module';

const pkg = dirname(createRequire(import.meta.url).resolve('@fontsource/noto-serif-kr/package.json'));
const outDir = 'src/styles';
const rel = relative(outDir, join(pkg, 'files')).split('\\').join('/');
const css = readFileSync(join(pkg, '400.css'), 'utf8')
  .replace(/,\s*url\([^)]*\.woff\) format\('woff'\)/g, '')
  .replace(/url\(\.\/files\//g, `url(${rel}/`);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'serif.css'), `/* scripts/build-font-css.mjs가 생성. 직접 고치지 않는다 */\n${css}`);
console.log(`serif.css (${(css.length / 1024).toFixed(0)}KB) → ${outDir}`);
