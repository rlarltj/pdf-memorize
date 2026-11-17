import { useCallback, useEffect, useState } from 'react';
import { cardsFromHighlights } from '../lib/cards/cards';
import { sha256 } from '../lib/fileHash';
import { extractHighlights } from '../lib/highlight/extractHighlights';
import { startOfDay, summarize, type DailySummary } from '../lib/srs/session';
import { store, type DocumentRecord, type ImportResult } from '../lib/store';

interface Props {
  onStudy: (documentId?: string) => void;
  onOpenDocument: (documentId: string) => void;
}

interface DocRow extends DocumentRecord {
  cardCount: number;
  summary: DailySummary;
}

type UploadState =
  | { status: 'idle' }
  | { status: 'working'; fileName: string }
  | { status: 'done'; fileName: string; result: ImportResult }
  | { status: 'error'; fileName: string; message: string };

export function HomeView({ onStudy, onOpenDocument }: Props) {
  const [docs, setDocs] = useState<DocRow[] | null>(null);
  const [total, setTotal] = useState<DailySummary | null>(null);
  const [upload, setUpload] = useState<UploadState>({ status: 'idle' });

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
  }, [refresh]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUpload({ status: 'working', fileName: file.name });
    try {
      const buf = await file.arrayBuffer();
      // pdf.js가 버퍼를 워커로 넘기며 비울 수 있어 해시를 먼저 계산
      const id = await sha256(buf);
      const extracted = await extractHighlights(buf);
      const cards = cardsFromHighlights(id, extracted.highlights);
      const result = await store.importDocument(
        { id, name: file.name, numPages: extracted.numPages, highlightCount: extracted.highlights.length },
        cards,
        new Date(),
      );
      setUpload({ status: 'done', fileName: file.name, result });
      await refresh();
    } catch (e) {
      setUpload({ status: 'error', fileName: file.name, message: e instanceof Error ? e.message : String(e) });
    }
  };

  const onDelete = async (d: DocRow) => {
    if (!confirm(`"${d.name}"와 카드 ${d.cardCount}장, 복습 기록을 모두 지울까요?`)) return;
    await store.deleteDocument(d.id);
    await refresh();
  };

  return (
    <main>
      <h1>PDF 하이라이트 암기</h1>
      <p className="hint">파일은 서버로 전송되지 않고 브라우저 안에서만 처리됩니다.</p>

      <section className="notice">
        <strong>오늘 학습</strong>
        {total ? (
          <p>
            복습 {total.due}장 · 새 카드 {total.newAvailable}장 · 오늘 {total.reviewedToday}회 복습
          </p>
        ) : (
          <p>불러오는 중...</p>
        )}
        <button className="primary" disabled={!total || total.due + total.newAvailable === 0} onClick={() => onStudy()}>
          학습 시작
        </button>
      </section>

      <h2>PDF 추가</h2>
      <input type="file" accept="application/pdf" onChange={(e) => onFile(e.target.files?.[0])} disabled={upload.status === 'working'} />
      {upload.status === 'working' && <p>{upload.fileName} 분석 중...</p>}
      {upload.status === 'done' && (
        <p>
          {upload.fileName}: 새 카드 {upload.result.added}장
          {upload.result.updated > 0 && `, 기존 카드 ${upload.result.updated}장 갱신`}
          {upload.result.kept > 0 && `, 직접 고친 카드 ${upload.result.kept}장 유지`}
        </p>
      )}
      {upload.status === 'error' && <p className="error">{upload.fileName}: {upload.message}</p>}

      <h2>문서</h2>
      {docs && docs.length === 0 && <p className="hint">아직 추가한 PDF가 없습니다.</p>}
      <ul className="doc-list">
        {docs?.map((d) => (
          <li key={d.id}>
            <div>
              <div className="doc-name">{d.name}</div>
              <div className="doc-stats">
                카드 {d.cardCount}장 · 복습 {d.summary.due} · 새 카드 {d.summary.newAvailable}
              </div>
            </div>
            <div className="row-actions">
              <button disabled={d.summary.due + d.summary.newAvailable === 0} onClick={() => onStudy(d.id)}>학습</button>
              <button onClick={() => onOpenDocument(d.id)}>카드 보기</button>
              <button className="danger" onClick={() => onDelete(d)}>삭제</button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
