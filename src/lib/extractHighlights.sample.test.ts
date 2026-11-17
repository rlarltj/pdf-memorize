import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractHighlights } from './extractHighlights';

/**
 * 실제 HWP 변환 PDF(노동법 판례 자료)로 돌리는 회귀 테스트.
 * 저작물이라 공개 저장소에 올리지 않는다. fixtures/local/sample.pdf가 있을 때만 실행된다.
 * 기대값은 2페이지를 렌더링해 눈으로 대조한 결과다.
 */
const SAMPLE = 'fixtures/local/sample.pdf';

describe.skipIf(!existsSync(SAMPLE))('실제 샘플 PDF', () => {
  it('2페이지 하이라이트와 두문자를 추출한다', async () => {
    const buf = readFileSync(SAMPLE);
    const r = await extractHighlights(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const page2 = r.highlights.filter((h) => h.page === 2);

    expect(r.numPages).toBe(40);
    expect(r.annotationCount).toBe(0);
    expect(page2).toContainEqual(expect.objectContaining({ text: '취업규칙을 근로자에게 불리하게 변경', keyLetters: '취규불변' }));
    expect(page2).toContainEqual(expect.objectContaining({ text: '집단적 동의권을 남용하였다고 볼 만한 특별한 사정', keyLetters: '집동남볼특' }));
    // 줄바꿈을 넘어가는 하이라이트
    expect(page2.map((h) => h.text)).toEqual(expect.arrayContaining(['명문화하기 전부터', '법리를 확립', '노사대등결정 원칙', '근본정신', '기득권 보호']));
  }, 30_000);
});
