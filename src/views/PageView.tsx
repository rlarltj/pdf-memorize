import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PdfPage, type ViewMode } from '../components/PdfPage';
import { colorStats, isBlank, setAllColors, toggleColor, toggleHighlight } from '../lib/blanks/blanks';
import { highlightKey } from '../lib/cards/cards';
import { sha256 } from '../lib/fileHash';
import type { Highlight } from '../lib/highlight/buildHighlights';
import type { PdfDocument } from '../lib/highlight/extractHighlights';
import { loadPdfTools } from '../lib/highlight/loadExtractor';
import { store, type BlankSettings, type DocumentRecord } from '../lib/store';

/** 원문 배율. 'fit'은 화면 폭에 맞춤 (최대 FIT_MAX) */
type Zoom = 'fit' | number;
const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 1.75, 2];
/** 배율 100%일 때 페이지 폭(px). A4 기준 본문 글자가 약 14px */
const BASE_WIDTH = 900;
const FIT_MAX = 1100;
const ZOOM_KEY = 'pdf-memorize.zoom';

function loadZoom(): Zoom {
  try {
    const v = localStorage.getItem(ZOOM_KEY);
    if (!v || v === 'fit') return 'fit';
    const n = Number(v);
    return ZOOM_STEPS.includes(n) ? n : 'fit';
  } catch {
    return 'fit';
  }
}

function saveZoom(z: Zoom) {
  try {
    localStorage.setItem(ZOOM_KEY, String(z));
  } catch {
    // 저장소를 못 쓰는 환경이면 이번 화면에서만 유지
  }
}

/** 문서 순서로 정렬한 하이라이트 (Enter로 이어서 펼칠 때 순서) */
interface Item {
  key: string;
  page: number;
  order: number;
  mainColor: string;
}

interface Props {
  documentId: string;
  onBack: () => void;
}

type Load =
  | { status: 'loading' }
  | { status: 'needFile'; error?: string }
  | { status: 'ready'; doc: PdfDocument }
  | { status: 'error'; message: string };

const isTyping = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;

/**
 * 원문 보기: PDF 페이지를 원래 모습(칠한 색 포함) 그대로 보여 주고 하이라이트를 빈칸으로 가린다.
 * - 암기: 빈칸을 눌러 펼치기. Enter는 화면 위치부터 다음 빈칸을 차례로, Shift+Enter는 되돌리기
 * - 빈칸 편집: 색 단위로 빈칸을 정하고, 하이라이트를 눌러 예외를 둔다 (문서별 저장)
 */
export function PageView({ documentId, onBack }: Props) {
  const [record, setRecord] = useState<DocumentRecord | null>(null);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [mode, setMode] = useState<ViewMode>('study');
  const [settings, setSettings] = useState<BlankSettings>({ documentId, excluded: [], updatedAt: new Date(0) });
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  /** 펼친 순서. Shift+Enter 되돌리기용 */
  const [revealStack, setRevealStack] = useState<string[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [indexedPages, setIndexedPages] = useState(0);
  const [zoom, setZoomState] = useState<Zoom>(loadZoom);
  const cache = useRef(new Map<number, Promise<Highlight[]>>());
  const tools = useRef<Awaited<ReturnType<typeof loadPdfTools>> | null>(null);

  // ---------- 배율 ----------
  const setZoom = useCallback((z: Zoom) => {
    setZoomState(z);
    saveZoom(z);
  }, []);
  const stepZoom = useCallback((dir: 1 | -1) => {
    setZoomState((z) => {
      const cur = z === 'fit' ? 1 : z;
      const steps = dir > 0 ? ZOOM_STEPS : [...ZOOM_STEPS].reverse();
      const next = steps.find((s) => (dir > 0 ? s > cur : s < cur)) ?? cur;
      saveZoom(next);
      return next;
    });
  }, []);

  // ---------- 문서 열기 ----------
  const open = useCallback(async (data: ArrayBuffer) => {
    tools.current ??= await loadPdfTools();
    // pdf.js가 버퍼를 워커로 넘기며 비우므로 복사본을 넘긴다
    const doc = await tools.current.openPdf(data.slice(0));
    cache.current.clear();
    setItems([]);
    setIndexedPages(0);
    setLoad({ status: 'ready', doc });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [docs, file, blanks] = await Promise.all([store.listDocuments(), store.getFile(documentId), store.getBlankSettings(documentId)]);
      if (cancelled) return;
      setRecord(docs.find((d) => d.id === documentId) ?? null);
      setSettings(blanks);
      if (!file) {
        setLoad({ status: 'needFile' });
        return;
      }
      try {
        await open(file.data);
      } catch (e) {
        setLoad({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId, open]);

  // 화면을 떠나면 문서를 닫아 워커 메모리를 돌려준다
  useEffect(() => {
    if (load.status !== 'ready') return;
    const doc = load.doc;
    return () => void doc.destroy();
  }, [load]);

  const loadHighlights = useCallback(
    (page: number) => {
      if (load.status !== 'ready' || !tools.current) return Promise.resolve([]);
      let p = cache.current.get(page);
      if (!p) {
        p = tools.current.extractPage(load.doc, page).then((r) => r.highlights);
        cache.current.set(page, p);
      }
      return p;
    },
    [load],
  );

  // 색 목록과 Enter 순서를 위해 전체 페이지를 백그라운드에서 한 번 분석한다 (보이는 페이지와 캐시를 같이 쓴다)
  useEffect(() => {
    if (load.status !== 'ready') return;
    let cancelled = false;
    void (async () => {
      const all: Item[] = [];
      for (let p = 1; p <= load.doc.numPages; p++) {
        const hs = await loadHighlights(p);
        if (cancelled) return;
        hs.forEach((h, i) => all.push({ key: highlightKey(h), page: p, order: i, mainColor: h.mainColor }));
        if (p % 5 === 0 || p === load.doc.numPages) {
          setItems([...all]);
          setIndexedPages(p);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, loadHighlights]);

  // ---------- 빈칸 설정 ----------
  const saveSettings = useCallback((next: BlankSettings) => {
    setSettings(next);
    void store.putBlankSettings(next);
  }, []);

  const onToggleBlank = useCallback(
    (key: string, mainColor: string) => {
      setSettings((prev) => {
        const next = toggleHighlight(prev, key, mainColor);
        void store.putBlankSettings(next);
        return next;
      });
    },
    [],
  );

  const stats = useMemo(() => colorStats(items.map((i) => i.mainColor)), [items]);
  const allColors = useMemo(() => stats.map((s) => s.color), [stats]);
  const blanks = useMemo(() => items.filter((i) => isBlank(settings, i.key, i.mainColor)), [items, settings]);

  // ---------- 펼치기 ----------
  const reveal = useCallback((key: string) => {
    setRevealed((prev) => new Set(prev).add(key));
    setRevealStack((prev) => [...prev, key]);
  }, []);

  const onToggleReveal = useCallback((key: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setRevealStack((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);

  const scrollToKey = useCallback((key: string, page: number) => {
    const el = document.querySelector<HTMLElement>(`.mask-box[data-key="${CSS.escape(key)}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      // 위에 고정된 툴바·색 패널 아래부터를 보이는 영역으로 본다
      const top = (document.querySelector('.page-sticky')?.getBoundingClientRect().bottom ?? 0) + 40;
      if (r.top < top || r.bottom > window.innerHeight - 80) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else {
      // 아직 그리지 않은 페이지면 페이지로 먼저 이동 (그려진 뒤 다음 Enter부터 정확히 따라감)
      document.querySelector(`section.pdf-page[aria-label="${page}쪽"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, []);

  /** 화면 위쪽에 걸친 페이지부터, 아직 펼치지 않은 다음 빈칸 */
  const revealNext = useCallback(() => {
    const sections = [...document.querySelectorAll<HTMLElement>('section.pdf-page')];
    const topSection = sections.find((s) => s.getBoundingClientRect().bottom > 80);
    const fromPage = topSection ? Number(topSection.getAttribute('aria-label')?.replace('쪽', '')) : 1;
    const last = revealStack[revealStack.length - 1];
    const lastItem = last ? blanks.find((b) => b.key === last) : undefined;
    const lastVisible = lastItem && lastItem.page >= fromPage;
    const pending = blanks.filter((b) => !revealed.has(b.key));
    // 방금 펼친 것이 화면 근처면 그 다음부터, 아니면 화면 위치부터
    const next =
      (lastVisible ? pending.find((b) => b.page > lastItem.page || (b.page === lastItem.page && b.order > lastItem.order)) : undefined) ??
      pending.find((b) => b.page >= fromPage) ??
      pending[0];
    if (!next) return;
    reveal(next.key);
    scrollToKey(next.key, next.page);
  }, [blanks, revealed, revealStack, reveal, scrollToKey]);

  const undoReveal = useCallback(() => {
    const last = revealStack[revealStack.length - 1];
    if (!last) return;
    setRevealStack((prev) => prev.slice(0, -1));
    setRevealed((prev) => {
      const next = new Set(prev);
      next.delete(last);
      return next;
    });
  }, [revealStack]);

  // ---------- 키보드 ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === 'Enter' && mode === 'study' && load.status === 'ready') {
        // 클릭한 빈칸에 포커스가 남아 있어도 같은 빈칸을 다시 누르지 않도록 가로챈다
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) undoReveal();
        else revealNext();
        return;
      }
      if (e.key === '+' || e.key === '=') stepZoom(1);
      else if (e.key === '-') stepZoom(-1);
      else if (e.key === '0') setZoom('fit');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mode, load.status, revealNext, undoReveal, stepZoom, setZoom]);

  const onReupload = async (file: File | undefined) => {
    if (!file) return;
    const data = await file.arrayBuffer();
    if ((await sha256(data)) !== documentId) {
      setLoad({ status: 'needFile', error: `${file.name}은(는) 이 문서와 다른 파일입니다. 처음 올린 것과 같은 PDF를 골라 주세요.` });
      return;
    }
    await store.putFile(documentId, data.slice(0));
    await open(data);
  };

  const indexing = load.status === 'ready' && indexedPages < load.doc.numPages;
  const revealedCount = blanks.filter((b) => revealed.has(b.key)).length;
  const currentKey = revealStack[revealStack.length - 1];

  return (
    <main className="page-view">
      <header className="brand">
        <h1 className="doc-name">{record?.name ?? '문서'}</h1>
      </header>
      <div className="page-sticky">
        <div className="page-toolbar">
          <button className="link" onClick={onBack}>← 홈</button>
          <div className="zoom" role="group" aria-label="배율">
            <button className="quiet" onClick={() => stepZoom(-1)} aria-label="축소 (-)" title="축소 (-)">−</button>
            <button className={`quiet zoom-label${zoom === 'fit' ? ' on' : ''}`} onClick={() => setZoom('fit')} title="폭 맞춤 (0)">
              {zoom === 'fit' ? '폭 맞춤' : `${Math.round(zoom * 100)}%`}
            </button>
            <button className="quiet" onClick={() => stepZoom(1)} aria-label="확대 (+)" title="확대 (+)">+</button>
          </div>
          <div className="filters" role="tablist" aria-label="보기 방식">
            <button role="tab" aria-selected={mode === 'study'} className={mode === 'study' ? 'on' : ''} onClick={() => setMode('study')}>
              암기
            </button>
            <button role="tab" aria-selected={mode === 'edit'} className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}>
              빈칸 편집
            </button>
          </div>
        </div>

        {load.status === 'ready' && (
          <div className="blank-panel">
            <div className="color-chips" role="group" aria-label="빈칸으로 쓸 색">
              <span className="panel-label">빈칸 색</span>
              {stats.map((s) => {
                const on = !settings.colors || settings.colors.includes(s.color);
                return (
                  <button
                    key={s.color}
                    className={`color-chip${on ? ' on' : ''}`}
                    aria-pressed={on}
                    title={on ? '이 색 하이라이트를 빈칸으로 씀' : '이 색은 빈칸으로 쓰지 않음'}
                    onClick={() => saveSettings(toggleColor(settings, s.color, allColors))}
                  >
                    <span className="swatch" style={{ background: `rgb(${s.color})` }} />
                    {s.count}
                  </button>
                );
              })}
              {stats.length > 1 && (
                <>
                  <button className="quiet" onClick={() => saveSettings(setAllColors(settings, allColors))}>전체</button>
                  <button className="quiet" onClick={() => saveSettings(setAllColors(settings, []))}>해제</button>
                </>
              )}
              {indexing && <span className="hint">색 찾는 중 {indexedPages}/{load.doc.numPages}쪽</span>}
            </div>
            <div className="page-help">
              {mode === 'study' ? (
                <>
                  <span>
                    빈칸 {blanks.length}개 중 {revealedCount}개 펼침 · <kbd>Enter</kbd> 다음 빈칸 · <kbd>Shift</kbd>+<kbd>Enter</kbd> 되돌리기 · 클릭으로도 펼침
                  </span>
                  {revealed.size > 0 && (
                    <button
                      className="quiet"
                      onClick={() => {
                        setRevealed(new Set());
                        setRevealStack([]);
                      }}
                    >
                      모두 다시 가리기
                    </button>
                  )}
                </>
              ) : (
                <span>색을 켜고 끄면 그 색 하이라이트가 한꺼번에 바뀝니다. 하이라이트를 누르면 그것만 예외로 바꿉니다. 자동 저장됩니다.</span>
              )}
            </div>
          </div>
        )}
      </div>

      {load.status === 'loading' && <p className="empty">여는 중...</p>}
      {load.status === 'error' && <p className="empty error">{load.message}</p>}
      {load.status === 'needFile' && (
        <div className="notice">
          <strong>원문을 보려면 PDF를 한 번 더 올려 주세요</strong>
          <p>원문 보기가 생기기 전에 추가한 문서라 원본이 저장되어 있지 않습니다. 원본은 이 브라우저에만 저장됩니다.</p>
          <label className="dropzone" style={{ marginTop: 12 }}>
            <input type="file" accept="application/pdf" onChange={(e) => void onReupload(e.target.files?.[0])} />
            <div className="dropzone-title">같은 PDF 선택</div>
          </label>
          {load.error && <p className="error" style={{ marginTop: 8 }}>{load.error}</p>}
        </div>
      )}
      {load.status === 'ready' && (
        <div className="pdf-scroll">
          <div className="pdf-pages" style={{ width: zoom === 'fit' ? `min(100%, ${FIT_MAX}px)` : `${BASE_WIDTH * zoom}px` }}>
            {Array.from({ length: load.doc.numPages }, (_, i) => (
              <PdfPage
                key={i + 1}
                doc={load.doc}
                pageNumber={i + 1}
                loadHighlights={loadHighlights}
                mode={mode}
                settings={settings}
                revealed={revealed}
                currentKey={currentKey}
                onToggleBlank={onToggleBlank}
                onToggleReveal={onToggleReveal}
              />
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
