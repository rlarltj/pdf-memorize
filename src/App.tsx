import { useCallback, useState } from 'react';
import { extractHighlights, type ExtractResult } from './lib/highlight/extractHighlights';
import { cardsFromHighlights, type CardContent } from './lib/cards/cards';
import { StudyCard } from './components/StudyCard';
import type { Grade } from './lib/cards/grades';
import './App.css';

const rgb = (c: string) => `rgb(${c})`;

type View = { name: 'upload' } | { name: 'study'; queue: CardContent[]; done: number };

export default function App() {
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [cards, setCards] = useState<CardContent[]>([]);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>({ name: 'upload' });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const r = await extractHighlights(await file.arrayBuffer());
      setResult(r);
      setCards(cardsFromHighlights(file.name, r.highlights));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // 아직 저장·복습 일정이 없는 세션: "다시"는 맨 뒤로 보내고 나머지는 이번 세션에서 끝낸다
  const onGrade = useCallback((grade: Grade) => {
    setView((v) => {
      if (v.name !== 'study') return v;
      const [head, ...rest] = v.queue;
      return grade === 1 ? { ...v, queue: [...rest, head] } : { ...v, queue: rest, done: v.done + 1 };
    });
  }, []);

  if (view.name === 'study') {
    const card = view.queue[0];
    return (
      <main>
        <header className="bar">
          <button className="link" onClick={() => setView({ name: 'upload' })}>← 목록</button>
          <span>남은 카드 {view.queue.length} · 완료 {view.done}</span>
        </header>
        {card ? <StudyCard card={card} onGrade={onGrade} /> : <p className="empty">이번 세션을 마쳤습니다.</p>}
      </main>
    );
  }

  return (
    <main>
      <h1>PDF 하이라이트 암기</h1>
      <p className="hint">파일은 서버로 전송되지 않고 브라우저 안에서만 처리됩니다.</p>
      <input type="file" accept="application/pdf" onChange={(e) => onFile(e.target.files?.[0])} />

      {loading && <p>{fileName} 분석 중...</p>}
      {error && <p className="error">오류: {error}</p>}

      {result && (
        <>
          <p className="summary">
            {fileName}: {result.numPages}페이지, 하이라이트 {result.highlights.length}개, 카드 {cards.length}장
          </p>
          <button className="primary" disabled={cards.length === 0} onClick={() => setView({ name: 'study', queue: cards, done: 0 })}>
            학습 시작
          </button>
          <ol className="list">
            {result.highlights.map((h) => (
              <li key={h.id}>
                <span className="page">p.{h.page}</span>
                {h.colors.map((c) => (
                  <span key={c} className="swatch" style={{ background: rgb(c) }} />
                ))}
                <span className="text">{h.text}</span>
                {h.keyLetters && <span className="keys">두문자: {h.keyLetters}</span>}
                {h.mnemonic && <span className="keys">[{h.mnemonic}]</span>}
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}
