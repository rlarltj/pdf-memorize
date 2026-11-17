/**
 * pdf.js(약 560KB)는 PDF를 올릴 때만 불러온다. 첫 화면과 학습 화면에는 필요 없다.
 */
export async function loadExtractor() {
  const [mod] = await Promise.all([import('./extractHighlights'), import('./pdfWorker')]);
  return mod.extractHighlights;
}

/** 원문 보기 화면용: 문서 열기·페이지별 추출 */
export async function loadPdfTools() {
  const [mod] = await Promise.all([import('./extractHighlights'), import('./pdfWorker')]);
  return { openPdf: mod.openPdf, extractPage: mod.extractPage };
}
