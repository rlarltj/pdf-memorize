import { useCallback, useEffect, useMemo, useState } from 'react';
import { StudyCard } from '../components/StudyCard';
import type { Grade } from '../lib/cards/grades';
import { grade, previewIntervals } from '../lib/srs/scheduler';
import { advanceQueue, buildQueue, startOfDay } from '../lib/srs/session';
import { store, type StoredCard } from '../lib/store';

interface Props {
  /** 지정하면 그 문서 카드만 학습 */
  documentId?: string;
  onExit: () => void;
}

export function StudyView({ documentId, onExit }: Props) {
  const [queue, setQueue] = useState<StoredCard[] | null>(null);
  const [done, setDone] = useState(0);

  useEffect(() => {
    const now = new Date();
    void Promise.all([store.listCards(documentId), store.listReviewsSince(startOfDay(now))]).then(([cards, reviews]) =>
      setQueue(buildQueue(cards, reviews, now)),
    );
  }, [documentId]);

  const card = queue?.[0];
  const intervals = useMemo(() => (card ? previewIntervals(card.schedule, new Date()) : undefined), [card]);

  const onGrade = useCallback(
    async (g: Grade) => {
      if (!card) return;
      const now = new Date();
      const { card: schedule } = grade(card.schedule, g, now);
      const updated = { ...card, schedule };
      await store.putCard(updated);
      await store.addReview({ cardId: card.id, documentId: card.documentId, grade: g, previousState: card.schedule.state, reviewedAt: now });
      setQueue((q) => (q ? advanceQueue(q, updated, now) : q));
      setDone((d) => d + 1);
    },
    [card],
  );

  return (
    <main>
      <header className="bar">
        <button className="link" onClick={onExit}>← 홈</button>
        {queue && <span>남은 카드 {queue.length} · 복습 {done}회</span>}
      </header>
      {!queue && <p className="empty">불러오는 중...</p>}
      {queue && card && <StudyCard key={card.id} card={card} intervals={intervals} onGrade={onGrade} />}
      {queue && !card && (
        <div className="empty">
          <p>{done > 0 ? '오늘 학습을 마쳤습니다.' : '지금 학습할 카드가 없습니다.'}</p>
          <button onClick={onExit}>홈으로</button>
        </div>
      )}
    </main>
  );
}
