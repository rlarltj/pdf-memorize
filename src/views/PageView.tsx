import { useCallback, useEffect, useRef, useState } from 'react';
import { PdfPage, type ViewMode } from '../components/PdfPage';
import { highlightKey } from '../lib/cards/cards';
import { sha256 } from '../lib/fileHash';
import type { Highlight } from '../lib/highlight/buildHighlights';
import type { PdfDocument } from '../lib/highlight/extractHighlights';
import { loadPdfTools } from '../lib/highlight/loadExtractor';
import { store, type DocumentRecord } from '../lib/store';

interface Props {
  documentId: string;
  onBack: () => void;
}

type Load =
  | { status: 'loading' }
  | { status: 'needFile'; error?: string }
  | { status: 'ready'; doc: PdfDocument }
  | { status: 'error'; message: string };

/**
 * 원문 보기: PDF 페이지를 원래 모습(칠한 색 포함) 그대로 보여 주고 하이라이트를 빈칸으로 가린다.
 * - 암기: 빈칸을 눌러 잠깐 펼쳐 보기
 * - 편집: 하이라이트를 눌러 빈칸에 넣고 빼기 (문서별 저장)
 */
export function PageView({ documentId, onBack }: Props) {
  const [record, setRecord] = useState<DocumentRecord | null>(null);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [mode, setMode] = useState<ViewMode>('study');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [allKeys, setAllKeys] = useState<Set<string>>(new Set());
  const cache = useRef(new Map<number, Promise<Highlight[]>>());
  const tools = useRef<Awaited<ReturnType<typeof loadPdfTools>> | null>(null);

  const open = useCallback(async (data: ArrayBuffer) => {
    tools.current ??= await loadPdfTools();
    // pdf.js가 버퍼를 워커로 넘기며 비우므로 복사본을 넘긴다
    const doc = await tools.current.openPdf(data.slice(0));
    cache.current.clear();
    setLoad({ status: 'ready', doc });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [docs, file, blanks] = await Promise.all([store.listDocuments(), store.getFile(documentId), store.getBlankSettings(documentId)]);
      if (cancelled) return;
      setRecord(docs.find((d) => d.id === documentId) ?? null);
      setExcluded(new Set(blanks.excluded));
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
        p = tools.current.extractPage(load.doc, page).then((r) => {
          setAllKeys((prev) => new Set([...prev, ...r.highlights.map(highlightKey)]));
          return r.highlights;
        });
        cache.current.set(page, p);
      }
      return p;
    },
    [load],
  );

  const onToggleBlank = useCallback(
    (key: string) => {
      setExcluded((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        void store.putBlankSettings({ documentId, excluded: [...next], updatedAt: new Date() });
        return next;
      });
    },
    [documentId],
  );

  const onToggleReveal = useCallback((key: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

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

  const blankCount = [...allKeys].filter((k) => !excluded.has(k)).length;

  return (
    <main className="page-view">
      <div className="page-toolbar">
        <button className="link" onClick={onBack}>← 홈</button>
        <div className="filters" role="tablist" aria-label="보기 방식">
          <button role="tab" aria-selected={mode === 'study'} className={mode === 'study' ? 'on' : ''} onClick={() => setMode('study')}>
            암기
          </button>
          <button role="tab" aria-selected={mode === 'edit'} className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}>
            빈칸 편집
          </button>
        </div>
      </div>
      <header className="brand">
        <h1 className="doc-name">{record?.name ?? '문서'}</h1>
      </header>
      <div className="page-help">
        {mode === 'study' ? (
          <>
            <span>가린 부분을 누르면 펼쳐집니다.</span>
            {revealed.size > 0 && (
              <button className="quiet" onClick={() => setRevealed(new Set())}>
                모두 다시 가리기
              </button>
            )}
          </>
        ) : (
          <span>하이라이트를 눌러 빈칸에 넣거나 뺍니다. 자동 저장됩니다.{allKeys.size > 0 && ` 지금까지 본 쪽에서 빈칸 ${blankCount}/${allKeys.size}`}</span>
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
        <div className="pdf-pages">
          {Array.from({ length: load.doc.numPages }, (_, i) => (
            <PdfPage
              key={i + 1}
              doc={load.doc}
              pageNumber={i + 1}
              loadHighlights={loadHighlights}
              mode={mode}
              excluded={excluded}
              revealed={revealed}
              onToggleBlank={onToggleBlank}
              onToggleReveal={onToggleReveal}
            />
          ))}
        </div>
      )}
    </main>
  );
}
