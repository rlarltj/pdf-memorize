import type { ExtractResult } from './extractHighlights';

export type DiagnosisKind = 'ok' | 'scanned' | 'brokenText' | 'annotationsOnly' | 'noHighlights';

export interface Diagnosis {
  kind: DiagnosisKind;
  /** 카드를 만들 수 있는지. false면 저장하지 않는다 */
  usable: boolean;
  message?: string;
}

// 깨진 글자가 이 비율을 넘으면 텍스트 추출을 믿을 수 없다고 본다
const BROKEN_RATIO = 0.2;

export function diagnose(r: ExtractResult): Diagnosis {
  if (r.textChars === 0) {
    return {
      kind: 'scanned',
      usable: false,
      message: '글자 정보가 없는 PDF입니다. 스캔하거나 사진으로 만든 PDF는 아직 지원하지 않습니다. 원본 HWP/Word 파일에서 PDF로 다시 저장해 보세요.',
    };
  }
  if (r.brokenChars / r.textChars > BROKEN_RATIO) {
    return {
      kind: 'brokenText',
      usable: false,
      message: 'PDF의 글자 정보가 깨져 있어 하이라이트 문구를 읽을 수 없습니다. 원본 파일에서 "PDF로 저장"(인쇄 아님)으로 다시 만들어 보세요.',
    };
  }
  if (r.highlights.length === 0 && r.annotationCount > 0) {
    return {
      kind: 'annotationsOnly',
      usable: false,
      message: `PDF 뷰어 앱에서 칠한 하이라이트 ${r.annotationCount}개를 찾았지만 글자와 연결하지 못했습니다.`,
    };
  }
  if (r.highlights.length === 0) {
    return {
      kind: 'noHighlights',
      usable: false,
      message: '하이라이트를 찾지 못했습니다. HWP/Word의 형광펜·글자 배경색이나 PDF 뷰어 앱(굿노트, 아크로뱃 등)의 형광펜으로 칠한 PDF를 올려 주세요. 앱에서 내보낼 때 "주석 병합"이나 "평탄화"를 켜면 형광펜이 그림으로 바뀌어 읽을 수 없습니다.',
    };
  }
  return { kind: 'ok', usable: true };
}

/** pdf.js 예외를 사용자 안내로 바꾼다 */
export function describeLoadError(e: unknown): string {
  const name = e instanceof Error ? e.name : '';
  if (name === 'PasswordException') return '암호가 걸린 PDF입니다. 암호를 해제한 뒤 다시 올려 주세요.';
  if (name === 'InvalidPDFException') return 'PDF 파일이 아니거나 손상된 파일입니다.';
  return `PDF를 읽지 못했습니다: ${e instanceof Error ? e.message : String(e)}`;
}
