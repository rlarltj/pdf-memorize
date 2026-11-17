import type { Highlight } from '../highlight/buildHighlights';

/**
 * 카드 유형
 * - cloze: 앞뒤 문맥을 보여 주고 하이라이트 문구를 빈칸으로 가린다
 * - keyLetters: 두문자만 보여 주고 문구를 떠올린다 (두문자가 2글자 이상일 때만)
 */
export type CardType = 'cloze' | 'keyLetters';

export interface CardContent {
  /**
   * `${documentId}:${page}:${문구 해시}:${type}`.
   * 하이라이트 순번이 아니라 내용으로 만들어, 같은 PDF를 다시 올리거나 추출 로직이 바뀌어도 기록이 이어진다
   */
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

/** FNV-1a 32비트. 충돌이 나도 같은 페이지 안의 같은 문구일 가능성이 높아 문제 되지 않는다 */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** 하이라이트를 문서 안에서 가리키는 안정적인 키: `${page}:${문구 해시}`. 카드 id와 빈칸 설정이 같이 쓴다 */
export function highlightKey(h: Pick<Highlight, 'page' | 'text'>): string {
  return `${h.page}:${hash(h.text.replace(/\s/g, ''))}`;
}

export function cardsFromHighlights(documentId: string, highlights: Highlight[]): CardContent[] {
  const cards: CardContent[] = [];
  const seen = new Set<string>();
  for (const h of highlights) {
    if (h.text.replace(/\s/g, '').length < MIN_ANSWER_LENGTH) continue;
    const key = `${documentId}:${highlightKey(h)}`;
    // 같은 페이지에 같은 문구가 두 번 칠해져 있으면 카드는 하나만
    if (seen.has(key)) continue;
    seen.add(key);
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
    // 목차·목록 페이지는 앞뒤 문맥이 번호뿐이라 빈칸 카드를 만들지 않는다 (D18)
    if (!h.onIndexPage) cards.push({ ...base, id: `${key}:cloze`, type: 'cloze' });
    if (h.keyLetters.length >= 2) cards.push({ ...base, id: `${key}:keyLetters`, type: 'keyLetters' });
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
