import { useCallback, useEffect, useState, type DragEvent } from 'react';
import { cardsFromHighlights } from '../lib/cards/cards';
import { sha256 } from '../lib/fileHash';
import { loadExtractor } from '../lib/highlight/loadExtractor';
import type { ExtractResult } from '../lib/highlight/extractHighlights';
import { describeLoadError, diagnose } from '../lib/highlight/diagnose';
import { startOfDay, summarize, type DailySummary } from '../lib/srs/session';
import { store, type DocumentRecord, type ImportResult } from '../lib/store';
import { AuthBar } from '../components/AuthBar';
import { SYNCED_EVENT, type SyncState } from '../hooks/useSync';

/** 브라우저 메모리에서 처리하므로 너무 큰 파일은 탭이 멈출 수 있다 (D21: 30MB, 2026-11-18 결정) */
const MAX_PDF_BYTES = 30 * 1024 * 1024;

interface Props {
  sync: SyncState;
  onStudy: (documentId?: string) => void;
  onOpenDocument: (documentId: string) => void;
  onOpenPages: (documentId: string) => void;
}

interface DocRow extends DocumentRecord {
  cardCount: number;
  summary: DailySummary;
}

type UploadState =
  | { status: 'idle' }
  | { status: 'working'; fileName: string; done?: number; total?: number }
  | { status: 'done'; fileName: string; result: ImportResult }
  | { status: 'error'; fileName: string; message: string }
  | { status: 'unsupported'; fileName: string; message: string };

export function HomeView({ sync, onStudy, onOpenDocument, onOpenPages }: Props) {
  const [docs, setDocs] = useState<DocRow[] | null>(null);
  const [total, setTotal] = useState<DailySummary | null>(null);
  const [upload, setUpload] = useState<UploadState>({ status: 'idle' });
  const [dragOver, setDragOver] = useState(false);

  const refresh = useCallback(async () => {
    const now = new Date();
    const [documents, cards, reviews] = await Promise.all([store.listDocuments(), store.listCards(), store.listReviewsSince(startOfDay(now))]);
    setTotal(summarize(cards, reviews, now));
    setDocs(
      documents.map((d) => {
        const own = cards.filter((c) => c.documentId === d.id);
        return { ...d, cardCount: own.length, summary: summarize(own, reviews.filter((r) => r.documentId === d.id), now) };
      }),
    );
  }, []);

  useEffect(() => {
    void refresh();
    const onSynced = () => void refresh();
    window.addEventListener(SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(SYNCED_EVENT, onSynced);
  }, [refresh]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_PDF_BYTES) {
      setUpload({ status: 'unsupported', fileName: file.name, message: `${MAX_PDF_BYTES / 1024 / 1024}MB보다 큰 PDF는 브라우저가 멈출 수 있어 받지 않습니다.` });
      return;
    }
    setUpload({ status: 'working', fileName: file.name });
    try {
      const buf = await file.arrayBuffer();
      // pdf.js가 버퍼를 워커로 넘기며 비울 수 있어 해시와 원본 복사본을 먼저 만든다
      const id = await sha256(buf);
      const original = buf.slice(0);
      let extracted: ExtractResult;
      try {
        const extractHighlights = await loadExtractor();
        extracted = await extractHighlights(buf, (done, total) => setUpload({ status: 'working', fileName: file.name, done, total }));
      } catch (e) {
        setUpload({ status: 'error', fileName: file.name, message: describeLoadError(e) });
        return;
      }
      const diagnosis = diagnose(extracted);
      if (!diagnosis.usable) {
        setUpload({ status: 'unsupported', fileName: file.name, message: diagnosis.message ?? '' });
        return;
      }
      const cards = cardsFromHighlights(id, extracted.highlights);
      const result = await store.importDocument(
        { id, name: file.name, numPages: extracted.numPages, highlightCount: extracted.highlights.length },
        cards,
        new Date(),
      );
      // 원문 보기용 원본. 이 브라우저에만 저장한다
      await store.putFile(id, original);
      setUpload({ status: 'done', fileName: file.name, result });
      await refresh();
      void sync.syncNow();
    } catch (e) {
      setUpload({ status: 'error', fileName: file.name, message: e instanceof Error ? e.message : String(e) });
    }
  };

  const onDelete = async (d: DocRow) => {
    if (!confirm(`"${d.name}"와 카드 ${d.cardCount}장, 복습 기록을 모두 지울까요?`)) return;
    await store.deleteDocument(d.id);
    await refresh();
    void sync.syncNow();
  };

  const busy = upload.status === 'working';
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!busy) void onFile(e.dataTransfer.files?.[0]);
  };

  return (
    <main>
      <AuthBar sync={sync} />
      <header className="brand">
        <h1>하이라이트 암기</h1>
        <span className="tagline">칠한 문장을 오래 기억하기</span>
      </header>

      <section className="today" aria-label="오늘 학습">
        <div className="today-label">오늘 학습</div>
        <div className="today-stats">
          <div className="stat">
            <strong>{total?.due ?? '–'}</strong>
            <span>복습할 카드</span>
          </div>
          <div className="stat">
            <strong>{total?.newAvailable ?? '–'}</strong>
            <span>새 카드</span>
          </div>
          <div className="stat">
            <strong>{total?.reviewedToday ?? '–'}</strong>
            <span>오늘 복습</span>
          </div>
        </div>
        <button className="primary" disabled={!total || total.due + total.newAvailable === 0} onClick={() => onStudy()}>
          {total && total.due + total.newAvailable === 0 && total.reviewedToday > 0 ? '오늘 학습 완료' : '학습 시작'}
        </button>
      </section>

      <h2>PDF 추가</h2>
      <label
        className={`dropzone${dragOver ? ' over' : ''}${busy ? ' busy' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept="application/pdf"
          disabled={busy}
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {busy ? (
          <>
            <div className="dropzone-title">{upload.fileName}</div>
            <div className="hint">{upload.total ? `${upload.done} / ${upload.total}쪽 분석 중` : '여는 중'}</div>
            <div className="progress" aria-hidden>
              <div style={{ width: `${upload.total ? (100 * (upload.done ?? 0)) / upload.total : 5}%` }} />
            </div>
          </>
        ) : (
          <>
            <div className="dropzone-title">PDF를 끌어다 놓거나 눌러서 선택</div>
            <div className="hint">형광펜·글자 배경색을 칠한 PDF · 30MB까지 · 파일은 이 브라우저 밖으로 나가지 않습니다</div>
          </>
        )}
      </label>
      {upload.status === 'done' && (
        <div className="notice">
          <strong>{upload.fileName}</strong>
          <p>
            새 카드 {upload.result.added}장
            {upload.result.updated > 0 && ` · 기존 카드 ${upload.result.updated}장 갱신`}
            {upload.result.kept > 0 && ` · 직접 고친 카드 ${upload.result.kept}장 유지`}
          </p>
        </div>
      )}
      {upload.status === 'error' && (
        <div className="notice warn">
          <strong>{upload.fileName}</strong>
          <p className="error">{upload.message}</p>
        </div>
      )}
      {upload.status === 'unsupported' && (
        <div className="notice warn">
          <strong>{upload.fileName}</strong>
          <p>{upload.message}</p>
        </div>
      )}

      <h2>문서</h2>
      {docs && docs.length === 0 && <p className="hint">아직 추가한 PDF가 없습니다.</p>}
      <ul className="doc-list">
        {docs?.map((d) => (
          <li key={d.id} className="doc-item">
            <p className="doc-name">{d.name}</p>
            <div className="doc-stats">
              <span>카드 <b>{d.cardCount}</b></span>
              <span>복습 <b>{d.summary.due}</b></span>
              <span>새 카드 <b>{d.summary.newAvailable}</b></span>
              <span>{d.numPages}쪽</span>
            </div>
            <div className="row-actions">
              <button className="primary" disabled={d.summary.due + d.summary.newAvailable === 0} onClick={() => onStudy(d.id)}>학습</button>
              <button onClick={() => onOpenPages(d.id)}>원문</button>
              <button onClick={() => onOpenDocument(d.id)}>카드</button>
              <button className="quiet danger" onClick={() => onDelete(d)}>삭제</button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
