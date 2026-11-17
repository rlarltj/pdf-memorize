import { describe, expect, it } from 'vitest';
import type { CardContent } from '../cards/cards';
import type { ReviewRecord, StoredCard } from '../store/types';
import { grade, newSchedule, previewIntervals, formatInterval, State } from './scheduler';
import { advanceQueue, buildQueue, summarize } from './session';

const NOW = new Date('2026-11-18T09:00:00');
const HOUR = 3_600_000;

function createSampleCard(over: Partial<StoredCard> = {}): StoredCard {
  const content: CardContent = {
    id: over.id ?? 'doc:1:a:cloze', documentId: 'doc', highlightId: '1-0', type: 'cloze', page: 1,
    answer: '근본정신', before: '', after: '', keyLetters: '',
  };
  return { ...content, schedule: newSchedule(NOW), suspended: false, edited: false, createdAt: NOW, updatedAt: NOW, ...over };
}

/** 한 번 "알맞음"으로 복습해 며칠 뒤로 미뤄진 카드 */
function createReviewedCard(id: string, dueOffsetMs: number): StoredCard {
  const c = createSampleCard({ id });
  let schedule = grade(c.schedule, 3, NOW).card;
  schedule = grade(schedule, 3, NOW).card;
  return { ...c, schedule: { ...schedule, due: new Date(NOW.getTime() + dueOffsetMs) } };
}

const reviewOfNew = (cardId: string): ReviewRecord => ({ id: cardId, cardId, documentId: 'doc', grade: 3, previousState: State.New, reviewedAt: NOW });

describe('buildQueue', () => {
  it('복습 예정이 지난 카드를 예정 시각 순으로 먼저, 그다음 새 카드를 페이지 순으로', () => {
    const cards = [
      createSampleCard({ id: 'new-p3', page: 3 }),
      createReviewedCard('due-late', -1 * HOUR),
      createSampleCard({ id: 'new-p1', page: 1 }),
      createReviewedCard('due-early', -5 * HOUR),
      createReviewedCard('future', 5 * HOUR),
    ];
    expect(buildQueue(cards, [], NOW).map((c) => c.id)).toEqual(['due-early', 'due-late', 'new-p1', 'new-p3']);
  });

  it('새 카드는 오늘 이미 본 만큼 빼고 하루 한도까지만', () => {
    const cards = Array.from({ length: 10 }, (_, i) => createSampleCard({ id: `n${i}`, page: i }));
    expect(buildQueue(cards, [reviewOfNew('x'), reviewOfNew('y')], NOW, 5)).toHaveLength(3);
  });

  it('제외한 카드는 넣지 않는다', () => {
    expect(buildQueue([createSampleCard({ suspended: true })], [], NOW)).toEqual([]);
  });

  it('요약은 복습 카드와 새 카드를 나눠 센다', () => {
    const cards = [createReviewedCard('d', -HOUR), createSampleCard({ id: 'n' })];
    expect(summarize(cards, [], NOW)).toEqual({ due: 1, newAvailable: 1, reviewedToday: 0 });
  });
});

describe('advanceQueue', () => {
  it('"다시"를 누른 새 카드는 몇 분 뒤라 세션 맨 뒤로 간다', () => {
    const [a, b] = [createSampleCard({ id: 'a' }), createSampleCard({ id: 'b' })];
    const updated = { ...a, schedule: grade(a.schedule, 1, NOW).card };
    expect(advanceQueue([a, b], updated, NOW).map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('며칠 뒤로 미뤄진 카드는 세션에서 빠진다', () => {
    const a = createSampleCard({ id: 'a' });
    const updated = { ...a, schedule: grade(a.schedule, 4, NOW).card };
    expect(advanceQueue([a], updated, NOW)).toEqual([]);
  });
});

describe('scheduler', () => {
  it('새 카드의 등급별 간격은 다시 < 쉬움', () => {
    const p = previewIntervals(newSchedule(NOW), NOW);
    expect(p[1]).toMatch(/분$/);
    expect(p[4]).toMatch(/일$/);
  });

  it('간격 표시', () => {
    expect(formatInterval(30_000)).toBe('1분');
    expect(formatInterval(3 * HOUR)).toBe('3시간');
    expect(formatInterval(10 * 24 * HOUR)).toBe('10일');
    expect(formatInterval(90 * 24 * HOUR)).toBe('3개월');
  });
});
