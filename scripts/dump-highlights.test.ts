// 로컬 디버깅용: SAMPLE_PAGES=2,15 npx vitest run scripts/dump-highlights.test.ts
import { readFileSync, existsSync } from 'node:fs';
import { it } from 'vitest';
import { extractHighlights } from '../src/lib/highlight/extractHighlights';

const file = process.env.SAMPLE_PDF ?? 'fixtures/local/sample.pdf';
it.skipIf(!process.env.SAMPLE_PAGES || !existsSync(file))('dump', async () => {
  const pages = process.env.SAMPLE_PAGES!.split(',').map(Number);
  const buf = readFileSync(file);
  const r = await extractHighlights(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  console.log(`pages=${r.numPages} textChars=${r.textChars} annots=${r.annotationCount} highlights=${r.highlights.length}`);
  for (const h of r.highlights.filter((x) => pages.includes(x.page))) {
    console.log(`p${h.page} ${h.text}${h.keyLetters ? `  {${h.keyLetters}}` : ''}${h.mnemonic ? `  [${h.mnemonic}]` : ''}\n     …${h.before} ___ ${h.after}…`);
  }
}, 60_000);
