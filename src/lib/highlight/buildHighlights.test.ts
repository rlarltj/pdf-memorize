import { describe, expect, it } from 'vitest';
import { buildHighlights, KEY_LETTER_COLOR, type PageChar } from './buildHighlights';

const BLUE = '192,205,239';

/**
 * 테스트용 표기법.
 * - `{...}`: 문구 배경색(BLUE). 안의 공백도 칠한 것으로 본다
 * - `<x>`: 노란 두문자. 문구 안팎 모두 가능
 * - `|`: 줄바꿈
 */
function paint(src: string): PageChar[] {
  const out: PageChar[] = [];
  let base = false;
  let key = false;
  for (const ch of src) {
    if (ch === '{') base = true;
    else if (ch === '}') base = false;
    else if (ch === '<') key = true;
    else if (ch === '>') key = false;
    else if (ch === '|') out.push({ eol: true });
    else out.push({ ch, color: key ? KEY_LETTER_COLOR : base ? BLUE : undefined });
  }
  return out;
}

const build = (src: string) => buildHighlights(paint(src), 1);

describe('buildHighlights', () => {
  it('문구 배경 위의 노란 글자를 두문자로 기록하고 뒤 괄호를 두문자 원문으로 붙인다', () => {
    const [h] = build('사용자가 {<취>업<규>칙을 근로자에게 <불>리하게 <변>경}하면서 [취규불변]');
    expect(h).toMatchObject({ text: '취업규칙을 근로자에게 불리하게 변경', keyLetters: '취규불변', mnemonic: '취규불변' });
  });

  it('첫 글자만 칠한 단어들은 한 문구로 묶고 양 끝을 단어 경계까지 넓힌다', () => {
    const hs = build('위 변경에 <사>회<통>념상 <합>리성이 있다는 이유<만>으로 그 유효성을 [사통합만]');
    expect(hs).toHaveLength(1);
    expect(hs[0]).toMatchObject({ text: '사회통념상 합리성이 있다는 이유만으로', keyLetters: '사통합만', mnemonic: '사통합만' });
  });

  it('칠하지 않은 공백 양쪽이 모두 두문자면 별개 구간으로 보고 묶은 뒤 단어 끝까지 넓힌다', () => {
    const [h] = build('이를 주장하는 <사>용자<가> <부>담한다.');
    expect(h.text).toBe('사용자가 부담한다');
  });

  it('띄어쓰기를 칠하지 않은 문구라도 같은 문구로 이어 붙인다', () => {
    expect(build('{근기법} {§31}에 따라').map((h) => h.text)).toEqual(['근기법 §31']);
  });

  it('줄바꿈을 넘어가는 문구는 공백으로 잇는다', () => {
    expect(build('근로조건의 {노사대등결정|원칙}과').map((h) => h.text)).toEqual(['노사대등결정 원칙']);
  });

  it('문장 부호를 넘어서 한 글자를 묶지 않는다', () => {
    const texts = build('기업의 <도>산을 피하고, <한>정되지').map((h) => h.text);
    expect(texts).toEqual(['도산을', '한정되지']);
  });

  it('괄호 하나가 앞쪽 여러 문구를 설명하면 모두에 붙인다', () => {
    const hs = build('{<재>무 및 <회>계}이 갖추어져 {<별>도의 <사>업체}로 취급, [재회/별사]');
    expect(hs.map((h) => h.mnemonic)).toEqual(['재회/별사', '재회/별사']);
  });

  it('이미 다른 괄호 뒤에 있는 문구에는 앞 괄호를 붙이지 않는다', () => {
    const hs = build('{<가>나 <다>라} [가다] 그리고 {<마>바 <사>아} [마사]');
    expect(hs.map((h) => h.mnemonic)).toEqual(['가다', '마사']);
  });

  it('두문자가 없는 무관한 문구에는 괄호를 붙이지 않는다', () => {
    const hs = build('{근기법 §31}에 따라 {<재>심판정}을 다투며 {<사>용자가 <부>담} [사부]');
    expect(hs.map((h) => [h.text, h.mnemonic])).toEqual([
      ['근기법 §31', undefined],
      ['재심판정', undefined],
      ['사용자가 부담', '사부'],
    ]);
  });

  it('두문자가 있는 문구가 없으면 바로 앞 문구 하나에만 붙인다', () => {
    const hs = build('{근로자} 그리고 {사용자} [근사]');
    expect(hs.map((h) => h.mnemonic)).toEqual([undefined, '근사']);
  });

  it('문구 영역을 줄마다 하나로 합친다', () => {
    // 1줄: "가나" (x 0~20), 2줄: "다" (x 0~10), 글자 폭 10, 줄 높이 10
    const at = (x: number, y: number) => ({ x0: x, x1: x + 10, y0: y, y1: y + 10 });
    const chars = [
      { ch: '가', color: BLUE, box: at(0, 100) },
      { ch: '나', color: BLUE, box: at(10, 100) },
      { eol: true as const },
      { ch: '다', color: BLUE, box: at(0, 80) },
      { ch: '끝', box: at(10, 80) },
    ];
    const [h] = buildHighlights(chars, 1);
    expect(h.text).toBe('가나 다');
    expect(h.boxes).toEqual([{ x0: 0, x1: 20, y0: 100, y1: 110 }, at(0, 80)]);
  });

  it('BMP 밖 글자가 섞여도 색 위치가 어긋나지 않는다', () => {
    const chars = [{ ch: '𝓐' }, { ch: '가', color: BLUE }, { ch: '나', color: BLUE }, { ch: '다' }];
    expect(buildHighlights(chars, 1).map((h) => h.text)).toEqual(['가나']);
  });

  it('길이로 잘린 문맥은 단어 경계에서 자르고 말줄임표를 붙인다', () => {
    const long = '가나다 '.repeat(30);
    const [h] = build(`${long}{근본정신} ${long}`);
    expect(h.before.startsWith('…')).toBe(true);
    expect(h.before.slice(1).trim().split(' ')[0]).toBe('가나다');
    expect(h.after.endsWith('…')).toBe(true);
    expect(h.after.slice(0, -1).trim().split(' ').at(-1)).toBe('가나다');
  });

  it('판례 번호가 많은 목차 페이지는 표시해 둔다', () => {
    const rows = Array.from({ length: 10 }, (_, i) => `${i + 1} {주제${i}} 20${10 + i}다${12345 + i}`).join('|');
    expect(build(rows).every((h) => h.onIndexPage)).toBe(true);
    expect(build('본문 {근본정신} 2012다85335 참고').some((h) => h.onIndexPage)).toBe(false);
  });

  it('번호 같은 괄호는 두문자로 보지 않는다', () => {
    expect(build('26 {직장폐쇄의 정당성} [12번]')[0].mnemonic).toBeUndefined();
    expect(build('{<근>로<자>성} [판례 3]')[0].mnemonic).toBeUndefined();
  });

  it('문구 전체가 노란색이면 두문자로 보지 않는다', () => {
    const [h] = build('그 <유효요건>이다');
    expect(h).toMatchObject({ text: '유효요건', keyLetters: '' });
  });

  it('빈칸 카드용 앞뒤 문맥은 같은 문장 안에서 자르고 두문자 괄호는 뺀다', () => {
    const [h] = build('앞 문장이다. 사용자가 {변경 권한}을 가진다 [변권]. 다음 문장');
    expect(h.before).toBe('사용자가');
    expect(h.after).toBe('을 가진다');
  });
});
