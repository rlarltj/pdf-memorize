import { getDocument, OPS } from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

/**
 * 하이라이트 한 덩어리. 색이 달라도 붙어 있는 글자는 한 문구로 합친다.
 * keyLetters: 문구 안에서 노란색으로 따로 칠한 글자(두문자 암기 표시).
 */
export interface Highlight {
  page: number;
  text: string;
  colors: string[];
  keyLetters: string;
}

export interface ExtractResult {
  numPages: number;
  annotationCount: number;
  highlights: Highlight[];
}

type Matrix = [number, number, number, number, number, number];
interface Rect { x0: number; y0: number; x1: number; y1: number; color: string }

const KEY_LETTER_COLOR = '255,255,0';

const multiply = (m: Matrix, n: number[]): Matrix => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Matrix, x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** 글자색으로 쓰는 진한 색, 흰색, 회색(표 음영)은 제외하고 밝은 유채색만 하이라이트로 본다. */
const isHighlightColor = ([r, g, b]: number[]) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return (r + g + b) / 3 > 150 && max - min > 20;
};

/**
 * HWP/Word에서 형광펜·글자 음영을 넣고 PDF로 변환하면 주석이 아니라 글자 뒤에 색 사각형이 그려진다.
 * operator list를 따라가며 밝은 유채색으로 채운 경로의 bbox를 수집한다.
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

async function extractFromPage(page: PDFPageProxy, pageNumber: number): Promise<Highlight[]> {
  const rects = await collectFillRects(page);
  if (rects.length === 0) return [];
  const content = await page.getTextContent();

  // 텍스트 아이템을 글자 단위로 나눠, 글자 중심점이 어느 색 사각형 안에 있는지 판정한다.
  type Char = { ch: string; color?: string } | { eol: true };
  const chars: Char[] = [];
  for (const item of content.items as TextItem[]) {
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

  const result: Highlight[] = [];
  let cur: { text: string; colors: Set<string>; keyLetters: string } | null = null;
  const flush = () => {
    if (!cur) return;
    const text = cur.text.replace(/\s+/g, ' ').trim();
    if (text) result.push({ page: pageNumber, text, colors: [...cur.colors], keyLetters: cur.keyLetters });
    cur = null;
  };
  for (const c of chars) {
    if ('eol' in c) {
      if (cur) cur.text += ' ';
    } else if (c.color) {
      cur ??= { text: '', colors: new Set(), keyLetters: '' };
      cur.text += c.ch;
      cur.colors.add(c.color);
      if (c.color === KEY_LETTER_COLOR) cur.keyLetters += c.ch;
    } else if (cur && c.ch.trim() === '') {
      cur.text += c.ch;
    } else {
      flush();
    }
  }
  flush();
  return result;
}

export async function extractHighlights(file: ArrayBuffer): Promise<ExtractResult> {
  const doc = await getDocument({ data: new Uint8Array(file) }).promise;
  const highlights: Highlight[] = [];
  let annotationCount = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    // PDF 뷰어 앱에서 칠한 Highlight 주석은 이번 범위가 아니지만, 존재 여부는 표시한다.
    annotationCount += (await page.getAnnotations()).filter((a) => a.subtype === 'Highlight').length;
    highlights.push(...(await extractFromPage(page, p)));
  }
  await doc.destroy();
  return { numPages: doc.numPages, annotationCount, highlights };
}
