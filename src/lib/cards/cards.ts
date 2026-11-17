import type { Highlight } from '../highlight/buildHighlights';

/**
 * 카드 유형
 * - cloze: 앞뒤 문맥을 보여 주고 하이라이트 문구를 빈칸으로 가린다
 * - keyLetters: 두문자만 보여 주고 문구를 떠올린다 (두문자가 2글자 이상일 때만)
 */
export type CardType = 'cloze' | 'keyLetters';

export interface CardContent {
  /** `${documentId}:${highlightId}:${type}`. 같은 PDF를 다시 올려도 같은 id가 나와 기록이 이어진다 */
  id: string;
  documentId: string;
  highlightId: string;
  type: CardType;
  page: number;
  /** 정답 문구. 사용자가 고칠 수 있다 */
  answer: string;
  before: string;
  after: string;
  keyLetters: string;
  mnemonic?: string;
}

const MIN_ANSWER_LENGTH = 2;

export function cardsFromHighlights(documentId: string, highlights: Highlight[]): CardContent[] {
  const cards: CardContent[] = [];
  for (const h of highlights) {
    if (h.text.replace(/\s/g, '').length < MIN_ANSWER_LENGTH) continue;
    const base = {
      documentId,
      highlightId: h.id,
      page: h.page,
      answer: h.text,
      before: h.before,
      after: h.after,
      keyLetters: h.keyLetters,
      mnemonic: h.mnemonic,
    };
    cards.push({ ...base, id: `${documentId}:${h.id}:cloze`, type: 'cloze' });
    if (h.keyLetters.length >= 2) cards.push({ ...base, id: `${documentId}:${h.id}:keyLetters`, type: 'keyLetters' });
  }
  return cards;
}

/** 빈칸 표시. 정답 길이를 대략 드러내되 글자 수를 그대로 노출하지는 않는다 */
export function blank(answer: string): string {
  const n = Math.min(Math.max(Math.ceil(answer.replace(/\s/g, '').length / 2), 3), 12);
  return '＿'.repeat(n);
}

/** 두문자 카드 힌트: "취·규·불·변" */
export function keyLetterHint(keyLetters: string): string {
  return [...keyLetters].join('·');
}
