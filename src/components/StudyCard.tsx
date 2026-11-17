import { useEffect, useState } from 'react';
import { keyLetterHint, type CardContent } from '../lib/cards/cards';
import { GRADES, type Grade } from '../lib/cards/grades';

interface Props {
  card: CardContent;
  /** 등급 버튼 아래 표시할 다음 복습 간격. 예: { 1: '1분', 3: '2일' } */
  intervals?: Partial<Record<Grade, string>>;
  onGrade: (grade: Grade) => void;
}

/** 앞면(문제) → 정답 보기 → 등급 선택. 키보드: Space/Enter 정답 보기, 1~4 등급 */
export function StudyCard({ card, intervals, onGrade }: Props) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => setRevealed(false), [card.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        onGrade(Number(e.key) as Grade);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, onGrade]);

  return (
    <article className="study-card">
      <div className="study-meta">
        <span className="tag">{card.type === 'cloze' ? '빈칸' : '두문자'}</span>
        <span>{card.page}쪽</span>
      </div>

      {card.type === 'cloze' ? (
        <p className="study-question">
          <span className="context">{card.before}</span>{' '}
          {revealed ? <mark className="answer">{card.answer}</mark> : <span className="blank" aria-label="빈칸">{' '.repeat(8)}</span>}{' '}
          <span className="context">{card.after}</span>
        </p>
      ) : (
        <div className="study-question">
          <div className="key-caption">이 두문자가 가리키는 문구는?</div>
          <div className="key-hint">{keyLetterHint(card.keyLetters)}</div>
          {revealed && (
            <p>
              <mark className="answer">{card.answer}</mark>
            </p>
          )}
        </div>
      )}

      {revealed && card.mnemonic && <p className="mnemonic">원문 두문자 [{card.mnemonic}]</p>}

      <div className="study-actions">
        {revealed ? (
          <div className="grades">
            {GRADES.map((g) => (
              <button key={g.grade} className={`grade ${g.className}`} onClick={() => onGrade(g.grade)}>
                <span>{g.label}</span>
                {intervals?.[g.grade] && <small>{intervals[g.grade]}</small>}
              </button>
            ))}
          </div>
        ) : (
          <button className="primary reveal" onClick={() => setRevealed(true)}>정답 보기</button>
        )}
        <p className="kbd-hint">{revealed ? '키보드 1 · 2 · 3 · 4' : '키보드 Space'}</p>
      </div>
    </article>
  );
}
