import { describe, expect, it } from 'vitest';
import type { BlankSettings } from '../store/types';
import { colorStats, isBlank, setAllColors, toggleColor, toggleHighlight } from './blanks';

const BLUE = '192,205,239';
const YELLOW = '255,255,0';
const GREEN = '186,255,26';
const createSampleSettings = (over: Partial<BlankSettings> = {}): BlankSettings => ({ documentId: 'doc', excluded: [], updatedAt: new Date(0), ...over });

describe('isBlank', () => {
  it('색 설정이 없으면 모든 하이라이트가 빈칸', () => {
    expect(isBlank(createSampleSettings(), 'k', GREEN)).toBe(true);
  });

  it('켠 색만 빈칸', () => {
    const s = createSampleSettings({ colors: [BLUE] });
    expect(isBlank(s, 'a', BLUE)).toBe(true);
    expect(isBlank(s, 'b', GREEN)).toBe(false);
  });

  it('하이라이트를 직접 바꾼 설정이 색 설정보다 우선', () => {
    const s = createSampleSettings({ colors: [BLUE], excluded: ['a'], included: ['b'] });
    expect(isBlank(s, 'a', BLUE)).toBe(false);
    expect(isBlank(s, 'b', GREEN)).toBe(true);
  });
});

describe('toggleHighlight', () => {
  it('켠 색의 하이라이트를 누르면 빈칸에서 빠지고, 다시 누르면 개별 설정 없이 색 설정으로 돌아간다', () => {
    let s = createSampleSettings({ colors: [BLUE] });
    s = toggleHighlight(s, 'a', BLUE);
    expect(isBlank(s, 'a', BLUE)).toBe(false);
    s = toggleHighlight(s, 'a', BLUE);
    expect(isBlank(s, 'a', BLUE)).toBe(true);
    expect(s.excluded).toEqual([]);
    expect(s.included).toEqual([]);
  });

  it('끈 색의 하이라이트도 눌러서 빈칸으로 만들 수 있다', () => {
    const s = toggleHighlight(createSampleSettings({ colors: [BLUE] }), 'g', GREEN);
    expect(isBlank(s, 'g', GREEN)).toBe(true);
  });
});

describe('색 선택', () => {
  it('전체 켜짐에서 한 색을 끄면 나머지 색만 켜진다', () => {
    const s = toggleColor(createSampleSettings(), YELLOW, [BLUE, YELLOW, GREEN]);
    expect(s.colors).toEqual([BLUE, GREEN]);
  });

  it('한꺼번에 정하면 개별 설정을 지운다', () => {
    const s = setAllColors(createSampleSettings({ excluded: ['a'], included: ['b'] }), []);
    expect(s).toMatchObject({ colors: [], excluded: [], included: [] });
  });

  it('색별 하이라이트 수를 많은 순으로', () => {
    expect(colorStats([BLUE, YELLOW, BLUE, '', GREEN, BLUE])).toEqual([
      { color: BLUE, count: 3 },
      { color: YELLOW, count: 1 },
      { color: GREEN, count: 1 },
    ]);
  });
});
