import { describe, expect, it } from 'vitest';
import { describeLoadError, diagnose } from './diagnose';
import type { ExtractResult } from './extractHighlights';
import type { Highlight } from './buildHighlights';

const hl: Highlight = { id: '1-0', page: 1, text: '문구', colors: [], mainColor: '', keyLetters: '', before: '', after: '', boxes: [] };
const createSampleResult = (over: Partial<ExtractResult> = {}): ExtractResult => ({
  numPages: 1, annotationCount: 0, textChars: 1000, brokenChars: 0, highlights: [hl], ...over,
});

describe('diagnose', () => {
  it.each<[string, Partial<ExtractResult>, boolean]>([
    ['ok', {}, true],
    ['scanned', { textChars: 0, highlights: [] }, false],
    ['brokenText', { brokenChars: 500 }, false],
    ['annotationsOnly', { highlights: [], annotationCount: 3 }, false],
    ['noHighlights', { highlights: [] }, false],
  ])('%s', (kind, over, usable) => {
    expect(diagnose(createSampleResult(over))).toMatchObject({ kind, usable });
  });

  it('깨진 글자가 조금 섞인 정도는 통과', () => {
    expect(diagnose(createSampleResult({ brokenChars: 50 })).kind).toBe('ok');
  });
});

describe('describeLoadError', () => {
  const err = (name: string) => Object.assign(new Error('x'), { name });
  it('암호·손상 PDF를 구분한다', () => {
    expect(describeLoadError(err('PasswordException'))).toContain('암호');
    expect(describeLoadError(err('InvalidPDFException'))).toContain('손상');
  });
});
