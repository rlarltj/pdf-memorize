import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { pdfAssets } from '../lib/highlight/extractHighlights';

// Node에서는 pdf.js가 파일 경로로 읽는다
const root = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
pdfAssets.cMapUrl = join(root, 'cmaps') + '/';
pdfAssets.standardFontDataUrl = join(root, 'standard_fonts') + '/';
