/**
 * 글자 단위 색 정보에서 하이라이트 문구를 만든다. PDF와 무관한 순수 로직이라 문자열로 바로 테스트할 수 있다.
 */

export type PageChar = { ch: string; color?: string } | { eol: true };

export interface Highlight {
  id: string;
  page: number;
  /** 하이라이트 문구 */
  text: string;
  /** 문구에 쓰인 배경색 (r,g,b) */
  colors: string[];
  /** 문구 안에서 노란색으로 칠한 글자 (두문자 표시) */
  keyLetters: string;
  /** 문구 뒤에 적힌 두문자 원문. 예: "인조운독", "재회명독/별사취할" */
  mnemonic?: string;
  /** 빈칸 카드용 앞뒤 문맥 (같은 문장 안) */
  before: string;
  after: string;
  /** 목차·판례 목록 같은 표 페이지. 앞뒤 문맥이 옆 칸 번호뿐이라 빈칸 카드로 쓸 수 없다 */
  onIndexPage?: boolean;
}

export const KEY_LETTER_COLOR = '255,255,0';

// 한 글자 하이라이트를 이웃과 묶을 때 허용하는 최대 간격(글자 수). 실제 자료에서 "경우에 한정되지" 정도
const SINGLE_JOIN_GAP = 10;
// 묶기를 끊는 문자. 문장·괄호 경계를 넘어 묶지 않는다
const BREAK = /[.,;:!?[\]()<>{}「」『』“”"']/;
// 두문자 괄호를 찾을 때 문구 뒤로 볼 범위
const MNEMONIC_LOOKAHEAD = 40;
// 하나의 두문자 괄호가 앞쪽 몇 글자 안의 문구까지 설명한다고 볼지
const MNEMONIC_LOOKBEHIND = 160;
const CONTEXT = 60;
// 판례 번호(2012다85335) 형태가 이만큼 있으면 목차·목록 페이지. 샘플 목차 34개, 본문 0~2개 (D18, 2026-11-18)
const INDEX_PAGE_CASE_NUMBERS = 10;
const CASE_NUMBER = /\d{2,4}\s?[가-힣]{1,2}\s?\d{3,}/g;
const MNEMONIC_SHAPE = /^[가-힣]{2,}(\/[가-힣]+)*$/;

interface Span { start: number; end: number }

const isSpace = (c: string) => /\s/.test(c);

export function buildHighlights(chars: PageChar[], page: number): Highlight[] {
  // 줄바꿈을 '\n'으로 펼쳐 문자열과 같은 인덱스의 색 배열을 만든다
  let s = '';
  const colorAt: (string | undefined)[] = [];
  for (const c of chars) {
    if ('eol' in c) {
      s += '\n';
      colorAt.push(undefined);
    } else {
      s += c.ch;
      colorAt.push(c.color);
    }
  }

  const spans = joinSingles(rawSpans(s, colorAt), s);
  const infos = spans.map((sp) => {
    const colors = new Set<string>();
    let keyLetters = '';
    for (let k = sp.start; k < sp.end; k++) {
      const c = colorAt[k];
      if (!c) continue;
      colors.add(c);
      if (c === KEY_LETTER_COLOR && !isSpace(s[k])) keyLetters += s[k];
    }
    const text = clean(s.slice(sp.start, sp.end));
    // 문구 전체가 노란색이면 두문자 표시가 아니라 그냥 노란 형광펜이다
    if (keyLetters === text.replace(/\s/g, '')) keyLetters = '';
    return { ...sp, text, colors: [...colors], keyLetters };
  });
  const mnemonics = findMnemonics(infos, s, colorAt);
  const onIndexPage = (s.match(CASE_NUMBER)?.length ?? 0) >= INDEX_PAGE_CASE_NUMBERS;

  return infos.map((sp, i) => ({
    id: `${page}-${i}`,
    page,
    text: sp.text,
    colors: sp.colors,
    keyLetters: sp.keyLetters,
    mnemonic: mnemonics.get(i),
    before: contextBefore(s, sp.start),
    after: contextAfter(s, sp.end),
    ...(onIndexPage ? { onIndexPage } : {}),
  })).filter((h) => h.text.length > 0);
}

/**
 * 색이 칠해진 글자가 이어진 구간.
 * 줄바꿈과 칠해진 공백은 넘어간다. 칠하지 않은 공백은 양쪽이 모두 두문자(노란색)일 때만 끊는다.
 * - 끊지 않으면 "사용자가 부담"의 두문자 "가", "부"가 한 구간이 되어 한 글자 묶기가 동작하지 않는다
 * - 항상 끊으면 띄어쓰기를 칠하지 않은 "근기법 §31"이 둘로 나뉜다
 */
function rawSpans(s: string, colorAt: (string | undefined)[]): Span[] {
  const spans: Span[] = [];
  let i = 0;
  while (i < s.length) {
    if (!colorAt[i] || isSpace(s[i])) { i++; continue; }
    const start = i;
    let end = i + 1;
    let j = end;
    while (j < s.length) {
      if (colorAt[j] && !isSpace(s[j])) { end = j + 1; j++; continue; }
      if (s[j] === '\n' || (isSpace(s[j]) && colorAt[j])) { j++; continue; }
      if (isSpace(s[j])) {
        let k = j;
        while (k < s.length && isSpace(s[k])) k++;
        const bothKeys = colorAt[end - 1] === KEY_LETTER_COLOR && colorAt[k] === KEY_LETTER_COLOR;
        if (colorAt[k] && !bothKeys) { j = k; continue; }
      }
      break;
    }
    spans.push({ start, end });
    i = end;
  }
  return spans;
}

const visibleLength = (s: string) => s.replace(/\s/g, '').length;

/**
 * 첫 글자만 칠한 두문자 표시("사회통념상 합리성이 ... 이유만으로")는 한 글자 구간이 여러 개 생긴다.
 * 한 글자 구간은 가까운 이웃 구간과 묶고, 묶음의 양 끝은 단어 경계까지 넓힌다.
 */
function joinSingles(spans: Span[], s: string): Span[] {
  const out: Span[] = [];
  const isShort = (sp: Span) => visibleLength(s.slice(sp.start, sp.end)) === 1;
  let cur: (Span & { shortStart: boolean; shortEnd: boolean }) | null = null;

  for (const sp of spans) {
    if (cur) {
      const gap = s.slice(cur.end, sp.start);
      const joinable = (cur.shortEnd || isShort(sp)) && gap.length <= SINGLE_JOIN_GAP && !BREAK.test(gap);
      if (joinable) {
        cur.end = sp.end;
        cur.shortEnd = isShort(sp);
        continue;
      }
      out.push(widen(cur, s));
    }
    cur = { ...sp, shortStart: isShort(sp), shortEnd: isShort(sp) };
  }
  if (cur) out.push(widen(cur, s));
  return out;
}

function widen(sp: Span & { shortStart: boolean; shortEnd: boolean }, s: string): Span {
  let { start, end } = sp;
  const inWord = (c: string | undefined) => c !== undefined && !isSpace(c) && !BREAK.test(c);
  if (sp.shortStart) while (inWord(s[start - 1])) start--;
  if (sp.shortEnd) while (inWord(s[end])) end++;
  return { start, end };
}

/**
 * 문구 뒤의 "[인조운독]" 같은 괄호를 두문자 원문으로 본다.
 * 괄호 하나가 앞쪽 여러 문구를 설명하므로(예: "[재회명독/별사취할]") 이전 괄호 이후의 가까운 문구 중에서 고른다.
 * - 노란 두문자가 있고 그 글자의 절반 이상이 괄호 안에 있는 문구에만 붙인다.
 *   모두 붙이면 "근기법 §31", "<부당해고구제 재심판정>" 같은 무관한 문구에도 붙는다 (2026-11-18, D3)
 * - 그런 문구가 없으면 바로 앞 문구 하나에만 붙인다
 */
function findMnemonics(spans: (Span & { keyLetters: string })[], s: string, colorAt: (string | undefined)[]): Map<number, string> {
  const result = new Map<number, string>();
  let lastBracketEnd = 0;
  for (let i = 0; i < spans.length; i++) {
    const end = spans[i].end;
    const window = s.slice(end, end + MNEMONIC_LOOKAHEAD);
    const m = window.match(/^([^[\]]*?)\[([가-힣A-Za-z0-9/·,\s]+)\]/);
    if (!m) continue;
    const bracketStart = end + m[1].length;
    // 괄호 앞에 다른 하이라이트가 있으면 그 하이라이트 몫이다
    const hasColorBefore = colorAt.slice(end, bracketStart).some((c, k) => c && !isSpace(s[end + k]));
    if (hasColorBefore) continue;
    const mnemonic = m[2].replace(/\s/g, '');
    // 두문자는 한글 글자를 '/'로 나눈 형태만 인정. "[12번]", "[판례 3]" 같은 번호 표기는 제외 (2026-11-18 브라우저 확인 중 발견)
    if (!MNEMONIC_SHAPE.test(mnemonic)) continue;

    const candidates: number[] = [];
    for (let k = i; k >= 0; k--) {
      if (spans[k].start < lastBracketEnd || bracketStart - spans[k].start > MNEMONIC_LOOKBEHIND) break;
      if (!result.has(k)) candidates.push(k);
    }
    const matching = candidates.filter((k) => keyLettersMatch(spans[k].keyLetters, mnemonic));
    for (const k of matching.length > 0 ? matching : candidates.slice(0, 1)) result.set(k, mnemonic);
    lastBracketEnd = bracketStart + m[0].length - m[1].length;
  }
  return result;
}

function keyLettersMatch(keyLetters: string, mnemonic: string): boolean {
  if (!keyLetters) return false;
  const inside = [...keyLetters].filter((ch) => mnemonic.includes(ch)).length;
  return inside * 2 >= keyLetters.length;
}

const clean = (t: string) => t.replace(/\s+/g, ' ').trim();

/** 같은 문장 안의 앞 문맥. 마침표·괄호 두문자 뒤에서 자른다. */
function contextBefore(s: string, start: number): string {
  const from = Math.max(0, start - CONTEXT);
  const raw = s.slice(from, start);
  const cut = Math.max(raw.lastIndexOf('. '), raw.lastIndexOf('.\n'), raw.lastIndexOf(']'));
  if (cut >= 0) return clean(raw.slice(cut + 1)).replace(/^\.\s*/, '');
  // 길이로 잘렸으면 단어 중간에서 시작하지 않도록 첫 공백까지 버리고 말줄임표를 붙인다
  if (from > 0 && !/\s/.test(s[from - 1])) {
    const firstSpace = raw.search(/\s/);
    return firstSpace >= 0 ? `…${clean(raw.slice(firstSpace))}` : '';
  }
  return (from > 0 ? '…' : '') + clean(raw);
}

/** 같은 문장 안의 뒷 문맥. 두문자 괄호는 답을 드러내므로 뺀다. */
function contextAfter(s: string, end: number): string {
  let raw = s.slice(end, end + CONTEXT);
  const stop = raw.search(/\.(\s|$)|\[/);
  if (stop >= 0) return clean(raw.slice(0, stop + (raw[stop] === '.' ? 1 : 0)));
  if (end + CONTEXT < s.length) {
    // 길이로 잘렸으면 마지막 단어를 버리고 말줄임표
    if (!/\s/.test(s[end + CONTEXT])) {
      const lastSpace = raw.search(/\s\S*$/);
      raw = lastSpace >= 0 ? raw.slice(0, lastSpace) : '';
    }
    return raw.trim() ? `${clean(raw)}…` : '';
  }
  return clean(raw);
}
