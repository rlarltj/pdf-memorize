import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { extractHighlights, type ExtractResult } from './extractHighlights';

/**
 * 실제 HWP 변환 PDF(노동법 판례 자료)로 돌리는 회귀 테스트.
 * 저작물이라 공개 저장소에 올리지 않는다. fixtures/local/sample.pdf가 있을 때만 실행된다.
 * 기대값은 2·15페이지를 렌더링해 눈으로 대조한 결과다 (2026-11-18).
 */
const SAMPLE = 'fixtures/local/sample.pdf';

describe.skipIf(!existsSync(SAMPLE))('실제 샘플 PDF', () => {
  let r: ExtractResult;
  const onPage = (p: number) => r.highlights.filter((h) => h.page === p);

  beforeAll(async () => {
    const buf = readFileSync(SAMPLE);
    r = await extractHighlights(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }, 60_000);

  it('문서 정보', () => {
    expect(r.numPages).toBe(40);
    expect(r.annotationCount).toBe(0);
    expect(r.textChars).toBeGreaterThan(40_000);
  });

  it('2페이지: 문구 배경 + 두문자 + 괄호 원문', () => {
    expect(onPage(2)).toContainEqual(expect.objectContaining({ text: '취업규칙을 근로자에게 불리하게 변경', keyLetters: '취규불변', mnemonic: '취규불변' }));
    expect(onPage(2)).toContainEqual(expect.objectContaining({ text: '사회통념상 합리성이 있다는 이유만으로 그 유효성을 인정할 수는 없다.', keyLetters: '사통합만인없' }));
    expect(onPage(2).map((h) => h.text)).toEqual(expect.arrayContaining(['명문화하기 전부터', '법리를 확립', '노사대등결정 원칙', '근본정신', '기득권 보호', '근기법 §4']));
  });

  it('15페이지: 회색 음영 문구와 두문자만 칠한 문장', () => {
    expect(onPage(15)).toContainEqual(expect.objectContaining({ text: '인적·물적 조직 및 운영상 독립', keyLetters: '인조운독', mnemonic: '인조운독' }));
    expect(onPage(15)).toContainEqual(expect.objectContaining({ text: '사용자가 부담한다', keyLetters: '사가부' }));
    expect(onPage(15)).toContainEqual(expect.objectContaining({ text: '도산을 회피하기 위한 경우에 한정되지 아니하고', mnemonic: '도회한아' }));
  });

  it('한 글자 하이라이트가 거의 남지 않는다', () => {
    const singles = r.highlights.filter((h) => h.text.replace(/\s/g, '').length === 1);
    expect(singles.length / r.highlights.length).toBeLessThan(0.03);
  });
});
