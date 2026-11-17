import { describe, expect, it } from 'vitest';
import type { Highlight } from '../highlight/buildHighlights';
import { blank, cardsFromHighlights, keyLetterHint } from './cards';

const h = (over: Partial<Highlight>): Highlight => ({
  id: '1-0', page: 1, text: '문구', colors: [], keyLetters: '', before: '', after: '', boxes: [], ...over,
});

describe('cardsFromHighlights', () => {
  it('모든 하이라이트에 빈칸 카드를, 두문자가 있으면 두문자 카드를 추가로 만든다', () => {
    const cards = cardsFromHighlights('doc', [
      h({ id: '1-0', text: '취업규칙을 근로자에게 불리하게 변경', keyLetters: '취규불변' }),
      h({ id: '1-1', text: '근본정신' }),
    ]);
    expect(cards.map((c) => c.type)).toEqual(['cloze', 'keyLetters', 'cloze']);
    expect(cards[0].id).toMatch(/^doc:1:[0-9a-z]+:cloze$/);
  });

  it('카드 id는 순번이 아니라 문구로 정해져 하이라이트 순서가 바뀌어도 같다', () => {
    const a = cardsFromHighlights('doc', [h({ id: '1-0', text: '근본정신' })]);
    const b = cardsFromHighlights('doc', [h({ id: '1-0', text: '앞에 추가됨' }), h({ id: '1-1', text: '근본정신' })]);
    expect(b[1].id).toBe(a[0].id);
  });

  it('같은 페이지의 같은 문구는 카드 하나로 합친다', () => {
    expect(cardsFromHighlights('doc', [h({ id: '1-0', text: '憲 §32③' }), h({ id: '1-5', text: '憲 §32③' })])).toHaveLength(1);
  });

  it('목차 페이지 하이라이트는 빈칸 카드를 만들지 않고 두문자 카드만 만든다', () => {
    const cards = cardsFromHighlights('doc', [
      h({ id: '1-0', text: '근기법상 근로자 개념', onIndexPage: true }),
      h({ id: '1-1', text: '취업규칙 불이익변경', keyLetters: '취불', onIndexPage: true }),
    ]);
    expect(cards.map((c) => c.type)).toEqual(['keyLetters']);
  });

  it('한 글자 하이라이트와 한 글자 두문자는 카드로 만들지 않는다', () => {
    const cards = cardsFromHighlights('doc', [h({ text: '없' }), h({ id: '1-2', text: '경영상의 이유', keyLetters: '경' })]);
    expect(cards.map((c) => c.type)).toEqual(['cloze']);
  });
});

describe('표시 도우미', () => {
  it('빈칸은 3~12칸 사이', () => {
    expect(blank('가')).toHaveLength(3);
    expect(blank('가'.repeat(100))).toHaveLength(12);
  });

  it('두문자 힌트는 가운뎃점으로 나눈다', () => {
    expect(keyLetterHint('취규불변')).toBe('취·규·불·변');
  });
});
