import { useCallback, useEffect, useMemo, useState } from 'react';
import { keyLetterHint } from '../lib/cards/cards';
import { formatInterval, State } from '../lib/srs/scheduler';
import { store, type DocumentRecord, type StoredCard } from '../lib/store';

interface Props {
  documentId: string;
  onBack: () => void;
  onStudy: (documentId: string) => void;
}

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

  const load = useCallback(async () => {
    const [docs, list] = await Promise.all([store.listDocuments(), store.listCards(documentId)]);
    setDoc(docs.find((d) => d.id === documentId) ?? null);
    setCards(list.sort((a, b) => a.page - b.page || a.createdAt.getTime() - b.createdAt.getTime() || a.type.localeCompare(b.type)));
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
      <header className="bar">
        <button className="link" onClick={onBack}>← 홈</button>
        <button onClick={() => onStudy(documentId)}>이 문서 학습</button>
      </header>
      <h1 className="doc-name">{doc?.name ?? '문서'}</h1>
      {cards && (
        <p className="hint">
          카드 {cards.length}장 · 제외 {cards.filter((c) => c.suspended).length}장 · 직접 고침 {cards.filter((c) => c.edited).length}장
        </p>
      )}

      <div className="row-actions" role="tablist">
        {FILTERS.map((f) => (
          <button key={f.value} className={filter === f.value ? 'primary' : ''} onClick={() => setFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      {!cards && <p className="empty">불러오는 중...</p>}
      {cards && visible.length === 0 && <p className="empty">해당하는 카드가 없습니다.</p>}

      {visible.map((c) => (
        <div key={c.id} className={`card-row${c.suspended ? ' suspended' : ''}`}>
          <div className="study-meta">
            <span>p.{c.page}</span>
            <span>{c.type === 'cloze' ? '빈칸' : `두문자 ${keyLetterHint(c.keyLetters)}`}</span>
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
            <p>
              {c.before} <mark className="answer">{c.answer}</mark> {c.after}
            </p>
          )}
          <div className="row-actions">
            {editing?.id === c.id ? (
              <>
                <button className="primary" onClick={() => saveEdit(c)}>저장</button>
                <button onClick={() => setEditing(null)}>취소</button>
              </>
            ) : (
              <button onClick={() => setEditing({ id: c.id, text: c.answer })}>정답 고치기</button>
            )}
            <button onClick={() => update({ ...c, suspended: !c.suspended })}>{c.suspended ? '학습에 다시 포함' : '학습에서 제외'}</button>
            <button className="danger" onClick={() => remove(c)}>삭제</button>
          </div>
        </div>
      ))}
    </main>
  );
}
