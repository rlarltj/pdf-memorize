import { GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { pdfAssets } from './extractHighlights';

// 브라우저 전용. 테스트(Node)에서는 import하지 않는다.
GlobalWorkerOptions.workerSrc = workerUrl;
// scripts/copy-pdfjs-assets.mjs가 public/pdfjs로 복사한 파일 (predev/prebuild)
pdfAssets.cMapUrl = `${import.meta.env.BASE_URL}pdfjs/cmaps/`;
pdfAssets.standardFontDataUrl = `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`;
