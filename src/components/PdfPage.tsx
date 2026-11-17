import { memo, useEffect, useRef, useState } from 'react';
import { highlightKey } from '../lib/cards/cards';
import type { Highlight } from '../lib/highlight/buildHighlights';
import type { PdfDocument } from '../lib/highlight/extractHighlights';

export type ViewMode = 'study' | 'edit';

interface Props {
  doc: PdfDocument;
  pageNumber: number;
  /** 한 페이지의 하이라이트를 계산한다 (부모가 페이지별로 캐시) */
  loadHighlights: (page: number) => Promise<Highlight[]>;
  mode: ViewMode;
  /** 빈칸에서 뺀 하이라이트 키 */
  excluded: Set<string>;
  /** 암기 모드에서 잠깐 펼쳐 본 빈칸 */
  revealed: Set<string>;
  onToggleBlank: (key: string) => void;
  onToggleReveal: (key: string) => void;
}

interface Overlay {
  key: string;
  text: string;
  /** 페이지 대비 비율(%) */
  rects: { left: number; top: number; width: number; height: number }[];
}

// 화면 근처에 올 때만 그리고, 멀어지면 캔버스를 비운다. 40쪽을 모두 고해상도로 들고 있으면 수백 MB가 된다
const NEAR = '800px 0px';
// 글자 영역보다 조금 넓게 가려 글자 끝이 비치지 않게 한다 (PDF 포인트 단위)
const PAD = 1.2;

function PdfPageImpl({ doc, pageNumber, loadHighlights, mode, excluded, revealed, onToggleBlank, onToggleReveal }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [aspect, setAspect] = useState(1.414);
  const [overlays, setOverlays] = useState<Overlay[] | null>(null);
  // 창 크기·배율·브라우저 확대가 바뀌면 그 해상도로 다시 그린다. 처음 그린 해상도로 늘리면 흐려진다
  const [renderKey, setRenderKey] = useState('');

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setRenderKey(`${Math.round(el.clientWidth)}@${window.devicePixelRatio}`), 120);
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => {
      ro.disconnect();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: NEAR });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // 하이라이트 위치는 한 번만 계산 (페이지 크기 비율이라 화면 폭과 무관)
  useEffect(() => {
    if (!near || overlays) return;
    let cancelled = false;
    void (async () => {
      const page = await doc.getPage(pageNumber);
      const vp = page.getViewport({ scale: 1 });
      const highlights = await loadHighlights(pageNumber);
      if (cancelled) return;
      setAspect(vp.height / vp.width);
      setOverlays(
        highlights.map((h) => ({
          key: highlightKey(h),
          text: h.text,
          rects: h.boxes.map((b) => {
            const [x1, y1, x2, y2] = vp.convertToViewportRectangle([b.x0 - PAD, b.y0 - PAD, b.x1 + PAD, b.y1 + PAD]);
            return {
              left: (100 * Math.min(x1, x2)) / vp.width,
              top: (100 * Math.min(y1, y2)) / vp.height,
              width: (100 * Math.abs(x2 - x1)) / vp.width,
              height: (100 * Math.abs(y2 - y1)) / vp.height,
            };
          }),
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [near, overlays, doc, pageNumber, loadHighlights]);

  // 캔버스 그리기·비우기
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !renderKey) return;
    if (!near) {
      canvas.width = 0;
      canvas.height = 0;
      return;
    }
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    let cancelled = false;
    void (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      // 고배율 모니터·브라우저 확대에서도 선명하게. 캔버스가 너무 커지지 않게 3배에서 자른다
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const viewport = page.getViewport({ scale: (wrap.clientWidth / base.width) * dpr });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = page.render({ canvasContext: canvas.getContext('2d')!, viewport });
      await task.promise.catch(() => undefined);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [near, doc, pageNumber, renderKey]);

  return (
    <section className="pdf-page" aria-label={`${pageNumber}쪽`}>
      <div ref={wrapRef} className="pdf-page-sheet" style={{ aspectRatio: `1 / ${aspect}` }}>
        <canvas ref={canvasRef} />
        {overlays?.map((o) => {
          const isBlank = !excluded.has(o.key);
          if (mode === 'study' && !isBlank) return null;
          const state =
            mode === 'edit' ? (isBlank ? 'edit-blank' : 'edit-shown') : revealed.has(o.key) ? 'peek' : 'mask';
          const label =
            mode === 'edit'
              ? `${isBlank ? '빈칸' : '빈칸 아님'}: ${o.text}. 눌러서 ${isBlank ? '빈칸에서 빼기' : '빈칸으로 만들기'}`
              : state === 'mask'
                ? '가린 문구. 눌러서 보기'
                : `${o.text}. 눌러서 다시 가리기`;
          const onClick = () => (mode === 'edit' ? onToggleBlank(o.key) : onToggleReveal(o.key));
          return o.rects.map((r, i) => (
            <button
              key={`${o.key}-${i}`}
              className={`mask-box ${state}`}
              style={{ left: `${r.left}%`, top: `${r.top}%`, width: `${r.width}%`, height: `${r.height}%` }}
              aria-label={i === 0 ? label : undefined}
              aria-hidden={i === 0 ? undefined : true}
              tabIndex={i === 0 ? 0 : -1}
              onClick={onClick}
            />
          ));
        })}
      </div>
      <div className="pdf-page-number">{pageNumber}</div>
    </section>
  );
}

export const PdfPage = memo(PdfPageImpl);
