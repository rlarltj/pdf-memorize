import { describe, expect, it } from 'vitest';
import { grade, newSchedule } from '../srs/scheduler';
import type { StoredCard } from '../store/types';
import { cardToRow, rowToCard } from './rows';

describe('카드 행 변환', () => {
  it('JSON(jsonb)을 거쳐도 FSRS 날짜와 카드 내용이 그대로 돌아온다', () => {
    const t = new Date('2026-11-18T09:00:00Z');
    const card: StoredCard = {
      id: 'doc:1:abc:cloze', documentId: 'doc', highlightId: '1-0', type: 'cloze', page: 1,
      answer: '근본정신', before: '앞', after: '뒤', keyLetters: '근정', mnemonic: '근정',
      schedule: grade(newSchedule(t), 3, t).card, suspended: false, edited: true, createdAt: t, updatedAt: t,
    };
    const overTheWire = JSON.parse(JSON.stringify(cardToRow(card, 'user')));
    const back = rowToCard(overTheWire);
    expect(back).toEqual(card);
    expect(back.schedule.due).toBeInstanceOf(Date);
  });
});
