/**
 * pdf.js(약 560KB)는 PDF를 올릴 때만 불러온다. 첫 화면과 학습 화면에는 필요 없다.
 */
export async function loadExtractor() {
  const [mod] = await Promise.all([import('./extractHighlights'), import('./pdfWorker')]);
  return mod.extractHighlights;
}
