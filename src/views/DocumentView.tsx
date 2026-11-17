import { useCallback, useEffect, useMemo, useState } from 'react';
import { keyLetterHint } from '../lib/cards/cards';
import { formatInterval, State } from '../lib/srs/scheduler';
import { store, type DocumentRecord, type StoredCard } from '../lib/store';

interface Props {
  documentId: string;
  onBack: () => void;
  onStudy: (documentId: string) => void;
}

const PAGE_SIZE = 50;

type Filter = 'all' | 'active' | 'suspended' | 'edited';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'active', label: '학습 중' },
  { value: 'suspended', label: '제외됨' },
  { value: 'edited', label: '직접 고침' },
];

function dueLabel(c: StoredCard, now: Date): string {
  if (c.schedule.state === State.New) return '새 카드';
  const ms = c.schedule.due.getTime() - now.getTime();
  return ms <= 0 ? '복습 예정' : `${formatInterval(ms)} 뒤 복습`;
}

export function DocumentView({ documentId, onBack, onStudy }: Props) {
  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [cards, setCards] = useState<StoredCard[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  // 카드가 1,000장 가까이 되어 한 번에 그리면 느리다
  const [shown, setShown] = useState(PAGE_SIZE);

  const load = useCallback(async () => {
    const [docs, list] = await Promise.all([store.listDocuments(), store.listCards(documentId)]);
    setDoc(docs.find((d) => d.id === documentId) ?? null);
    setCards(list.sort((a, b) => a.page - b.page || Number(a.highlightId.split('-')[1]) - Number(b.highlightId.split('-')[1]) || a.type.localeCompare(b.type)));
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const list = cards ?? [];
    switch (filter) {
      case 'active':
        return list.filter((c) => !c.suspended);
      case 'suspended':
        return list.filter((c) => c.suspended);
      case 'edited':
        return list.filter((c) => c.edited);
      default:
        return list;
    }
  }, [cards, filter]);

  const update = async (card: StoredCard) => {
    await store.putCard(card);
    setCards((cs) => cs?.map((c) => (c.id === card.id ? card : c)) ?? null);
  };

  const saveEdit = async (card: StoredCard) => {
    if (!editing) return;
    const answer = editing.text.trim();
    setEditing(null);
    if (!answer || answer === card.answer) return;
    await update({ ...card, answer, edited: true });
  };

  const remove = async (card: StoredCard) => {
    if (!confirm(`"${card.answer}" 카드를 지울까요? 같은 PDF를 다시 올리면 새 카드로 다시 생깁니다.`)) return;
    await store.deleteCard(card.id);
    setCards((cs) => cs?.filter((c) => c.id !== card.id) ?? null);
  };

  const now = new Date();

  return (
    <main>
      <div className="study-top">
        <button className="link" onClick={onBack}>← 홈</button>
        <button className="primary" onClick={() => onStudy(documentId)}>이 문서 학습</button>
      </div>
      <header className="brand">
        <h1 className="doc-name">{doc?.name ?? '문서'}</h1>
      </header>
      {cards && (
        <div className="doc-stats">
          <span>카드 <b>{cards.length}</b></span>
          <span>제외 <b>{cards.filter((c) => c.suspended).length}</b></span>
          <span>직접 고침 <b>{cards.filter((c) => c.edited).length}</b></span>
        </div>
      )}

      <div className="filters" role="tablist">
        {FILTERS.map((f) => (
          <button key={f.value} role="tab" aria-selected={filter === f.value} className={filter === f.value ? 'on' : ''} onClick={() => {
            setFilter(f.value);
            setShown(PAGE_SIZE);
          }}>
            {f.label}
          </button>
        ))}
      </div>

      {!cards && <p className="empty">불러오는 중...</p>}
      {cards && visible.length === 0 && <p className="empty">해당하는 카드가 없습니다.</p>}

      <div className="card-list">
        {visible.slice(0, shown).map((c) => (
          <article key={c.id} className={`card-row${c.suspended ? ' suspended' : ''}`}>
            <div className="study-meta">
              <span className="tag">{c.type === 'cloze' ? '빈칸' : `두문자 ${keyLetterHint(c.keyLetters)}`}</span>
              <span>{c.page}쪽</span>
              <span>{c.suspended ? '제외됨' : dueLabel(c, now)}</span>
              {c.edited && <span>직접 고침</span>}
            </div>
            {editing?.id === c.id ? (
              <textarea
                autoFocus
                rows={2}
                value={editing.text}
                onChange={(e) => setEditing({ id: c.id, text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void saveEdit(c);
                  } else if (e.key === 'Escape') setEditing(null);
                }}
              />
            ) : (
              <p className="quote">
                <span className="context">{c.before}</span> <mark className="answer">{c.answer}</mark> <span className="context">{c.after}</span>
              </p>
            )}
            <div className="row-actions">
              {editing?.id === c.id ? (
                <>
                  <button className="primary" onClick={() => saveEdit(c)}>저장</button>
                  <button className="quiet" onClick={() => setEditing(null)}>취소</button>
                </>
              ) : (
                <button className="quiet" onClick={() => setEditing({ id: c.id, text: c.answer })}>정답 고치기</button>
              )}
              <button className="quiet" onClick={() => update({ ...c, suspended: !c.suspended })}>{c.suspended ? '학습에 다시 포함' : '학습에서 제외'}</button>
              <button className="quiet danger" onClick={() => remove(c)}>삭제</button>
            </div>
          </article>
        ))}
      </div>
      {visible.length > shown && (
        <div className="empty">
          <button onClick={() => setShown((n) => n + PAGE_SIZE)}>더 보기 ({visible.length - shown}장 남음)</button>
        </div>
      )}
    </main>
  );
}
