import { useState } from 'react';
import { extractHighlights, type ExtractResult, type Highlight } from './lib/extractHighlights';
import './App.css';

const rgb = (c: string) => `rgb(${c})`;

/** 단일 글자 하이라이트는 문맥 없이 암기 카드로 쓰기 어려워 기본 숨김 */
const isMeaningful = (h: Highlight) => h.text.replace(/\s/g, '').length >= 2;

export default function App() {
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSingle, setShowSingle] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setLoading(true);
    setError('');
    setResult(null);
    try {
      setResult(await extractHighlights(await file.arrayBuffer()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const visible = result?.highlights.filter((h) => showSingle || isMeaningful(h)) ?? [];

  return (
    <main>
      <h1>PDF 하이라이트 추출</h1>
      <p className="hint">파일은 서버로 전송되지 않고 브라우저 안에서만 처리됩니다.</p>
      <input type="file" accept="application/pdf" onChange={(e) => onFile(e.target.files?.[0])} />

      {loading && <p>{fileName} 분석 중...</p>}
      {error && <p className="error">오류: {error}</p>}

      {result && (
        <>
          <p className="summary">
            {fileName}: {result.numPages}페이지, 하이라이트 {result.highlights.length}개
            (2글자 이상 {result.highlights.filter(isMeaningful).length}개)
            {result.annotationCount > 0 && `, PDF 주석 하이라이트 ${result.annotationCount}개는 미지원`}
          </p>
          <label>
            <input type="checkbox" checked={showSingle} onChange={(e) => setShowSingle(e.target.checked)} /> 한 글자 하이라이트도 표시
          </label>
          <ol className="list">
            {visible.map((h, i) => (
              <li key={i}>
                <span className="page">p.{h.page}</span>
                {h.colors.map((c) => (
                  <span key={c} className="swatch" style={{ background: rgb(c) }} />
                ))}
                <span className="text">{h.text}</span>
                {h.keyLetters && h.keyLetters !== h.text.replace(/\s/g, '') && (
                  <span className="keys">두문자: {h.keyLetters}</span>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}
