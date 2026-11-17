import { getDocument, OPS } from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { buildHighlights, type Highlight, type PageChar } from './buildHighlights';

export type { Highlight } from './buildHighlights';

export interface ExtractResult {
  numPages: number;
  /** PDF 뷰어 앱에서 칠한 Highlight 주석 개수 */
  annotationCount: number;
  /** 추출된 전체 글자 수. 0이면 스캔본(이미지 PDF) */
  textChars: number;
  highlights: Highlight[];
}

type Matrix = [number, number, number, number, number, number];
interface Rect { x0: number; y0: number; x1: number; y1: number; color: string }

const multiply = (m: Matrix, n: number[]): Matrix => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Matrix, x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/**
 * 하이라이트 배경으로 볼 색.
 * - 밝은 유채색: 형광펜
 * - 중간 밝기 회색(약 190~235): 실제 자료에서 문구 음영으로 쓰임 (2026-11-18 샘플 15페이지 "[인조운독]" 문구)
 * 흰색·아주 연한 회색(표 배경)과 진한 색(글자색, 제목 띠)은 제외한다.
 */
export const isHighlightColor = ([r, g, b]: number[]) => {
  const avg = (r + g + b) / 3;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  if (avg <= 150) return false;
  if (chroma > 20) return true;
  return avg >= 190 && avg <= 235;
};

/**
 * HWP/Word에서 형광펜·글자 음영을 넣고 PDF로 변환하면 주석이 아니라 글자 뒤에 색 사각형이 그려진다.
 * operator list를 따라가며 하이라이트 색으로 채운 경로의 bbox를 수집한다.
 */
async function collectFillRects(page: PDFPageProxy): Promise<Rect[]> {
  const ops = await page.getOperatorList();
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  let fill = [0, 0, 0];
  const stack: Array<[Matrix, number[]]> = [];
  let pending: Omit<Rect, 'color'>[] = [];
  const rects: Rect[] = [];

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    switch (fn) {
      case OPS.save:
        stack.push([ctm, fill]);
        break;
      case OPS.restore:
        [ctm, fill] = stack.pop() ?? [ctm, fill];
        break;
      case OPS.transform:
        ctm = multiply(ctm, args);
        break;
      case OPS.setFillRGBColor:
        fill = Array.from(Object.values(args) as number[]);
        break;
      case OPS.constructPath: {
        const minMax = args[2];
        if (minMax) {
          const pts = [
            apply(ctm, minMax[0], minMax[1]), apply(ctm, minMax[2], minMax[3]),
            apply(ctm, minMax[0], minMax[3]), apply(ctm, minMax[2], minMax[1]),
          ];
          const xs = pts.map((p) => p[0]);
          const ys = pts.map((p) => p[1]);
          pending.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
        }
        break;
      }
      case OPS.fill:
      case OPS.eoFill:
        if (isHighlightColor(fill)) {
          const color = fill.join(',');
          for (const r of pending) rects.push({ ...r, color });
        }
        pending = [];
        break;
      case OPS.stroke:
      case OPS.closeStroke:
      case OPS.endPath:
      case OPS.fillStroke:
      case OPS.eoFillStroke:
        pending = [];
        break;
    }
  }
  return rects;
}

/** 사각형이 겹치면 나중에 그린(위에 보이는) 색이 이긴다. 두문자 노란색이 문구 배경 위에 칠해지는 경우. */
function topmostColorAt(rects: Rect[], x: number, y: number): string | undefined {
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return r.color;
  }
  return undefined;
}

/** 텍스트 아이템을 글자 단위로 나눠 글자 중심점이 들어가는 사각형의 색을 붙인다. */
function toPageChars(items: TextItem[], rects: Rect[]): PageChar[] {
  const chars: PageChar[] = [];
  for (const item of items) {
    if (item.str) {
      const [, , , d, e, f] = item.transform;
      const glyphs = [...item.str];
      const w = item.width / glyphs.length;
      glyphs.forEach((ch, k) => {
        const cx = e + w * (k + 0.5);
        const cy = f + Math.abs(d) * 0.35;
        chars.push({ ch, color: topmostColorAt(rects, cx, cy) });
      });
    }
    if (item.hasEOL) chars.push({ eol: true });
  }
  return chars;
}

export async function extractHighlights(file: ArrayBuffer): Promise<ExtractResult> {
  const doc = await getDocument({ data: new Uint8Array(file) }).promise;
  const highlights: Highlight[] = [];
  let annotationCount = 0;
  let textChars = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    annotationCount += (await page.getAnnotations()).filter((a) => a.subtype === 'Highlight').length;
    const items = (await page.getTextContent()).items as TextItem[];
    textChars += items.reduce((n, it) => n + (it.str?.trim().length ?? 0), 0);
    const rects = await collectFillRects(page);
    if (rects.length > 0) highlights.push(...buildHighlights(toPageChars(items, rects), p));
  }
  await doc.destroy();
  return { numPages: doc.numPages, annotationCount, textChars, highlights };
}
