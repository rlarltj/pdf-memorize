import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { extractHighlights } from './extractHighlights';

/**
 * HWP/Word가 내보내는 구조를 흉내 낸 PDF를 테스트 안에서 생성한다.
 * 글자 뒤에 색 사각형을 먼저 그리고 그 위에 글자를 쓴다.
 * 추출 로직이 글자 폭을 균등하다고 가정하므로 고정폭 폰트(Courier)를 쓴다.
 */
const SIZE = 12;
const LIGHT_BLUE = rgb(192 / 255, 205 / 255, 239 / 255);
const YELLOW = rgb(1, 1, 0);
const MID_GRAY = rgb(217 / 255, 217 / 255, 217 / 255);
const TABLE_GRAY = rgb(242 / 255, 242 / 255, 242 / 255);
const RED = rgb(1, 0, 0);

interface Mark { from: number; to: number; color: ReturnType<typeof rgb> }

function line(page: PDFPage, font: PDFFont, text: string, y: number, marks: Mark[] = [], textColor = rgb(0, 0, 0)) {
  const x = 50;
  const charW = font.widthOfTextAtSize('M', SIZE);
  for (const m of marks) {
    page.drawRectangle({ x: x + charW * m.from, y: y - 3, width: charW * (m.to - m.from), height: SIZE + 2, color: m.color });
  }
  page.drawText(text, { x, y, size: SIZE, font, color: textColor });
}

async function buildPdf(draw: (page: PDFPage, font: PDFFont) => void): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Courier);
  draw(doc.addPage([600, 800]), font);
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const texts = (r: Awaited<ReturnType<typeof extractHighlights>>) => r.highlights.map((h) => h.text);

describe('extractHighlights', () => {
  it('배경색 사각형 뒤의 글자를 하이라이트로 추출한다', async () => {
    const pdf = await buildPdf((page, font) => {
      line(page, font, 'the quick brown fox', 700, [{ from: 4, to: 15, color: LIGHT_BLUE }]);
    });
    const r = await extractHighlights(pdf);
    expect(texts(r)).toEqual(['quick brown']);
    expect(r.annotationCount).toBe(0);
  });

  it('색이 달라도 붙어 있으면 한 문구로 합치고 노란 글자는 두문자로 기록한다', async () => {
    const pdf = await buildPdf((page, font) => {
      line(page, font, 'Apple Banana', 700, [
        { from: 0, to: 12, color: LIGHT_BLUE },
        { from: 0, to: 1, color: YELLOW },
        { from: 6, to: 7, color: YELLOW },
      ]);
    });
    const [h] = (await extractHighlights(pdf)).highlights;
    expect(h.text).toBe('Apple Banana');
    expect(h.keyLetters).toBe('AB');
    expect(h.colors).toEqual(expect.arrayContaining(['192,205,239', '255,255,0']));
  });

  it('하이라이트가 아닌 글자로 끊기면 별도 하이라이트가 된다', async () => {
    const pdf = await buildPdf((page, font) => {
      line(page, font, 'alpha beta gamma', 700, [
        { from: 0, to: 5, color: LIGHT_BLUE },
        { from: 11, to: 16, color: LIGHT_BLUE },
      ]);
    });
    expect(texts(await extractHighlights(pdf))).toEqual(['alpha', 'gamma']);
  });

  it('줄바꿈을 넘어가는 하이라이트는 공백으로 이어 붙인다', async () => {
    const pdf = await buildPdf((page, font) => {
      line(page, font, 'first line ends', 700, [{ from: 11, to: 15, color: LIGHT_BLUE }]);
      line(page, font, 'here and more', 680, [{ from: 0, to: 4, color: LIGHT_BLUE }]);
    });
    expect(texts(await extractHighlights(pdf))).toEqual(['ends here']);
  });

  it('중간 밝기 회색 음영은 하이라이트로 본다', async () => {
    const pdf = await buildPdf((page, font) => {
      line(page, font, 'gray phrase here', 700, [{ from: 0, to: 11, color: MID_GRAY }]);
    });
    expect(texts(await extractHighlights(pdf))).toEqual(['gray phrase']);
  });

  it('아주 연한 회색(표 배경)과 진한 색 사각형은 하이라이트로 보지 않는다', async () => {
    const pdf = await buildPdf((page, font) => {
      line(page, font, 'table header', 700, [{ from: 0, to: 12, color: TABLE_GRAY }]);
      line(page, font, 'title bar', 650, [{ from: 0, to: 9, color: RED }]);
    });
    expect(texts(await extractHighlights(pdf))).toEqual([]);
  });

  it('글자색만 바뀐 텍스트는 하이라이트가 아니다', async () => {
    const pdf = await buildPdf((page, font) => {
      line(page, font, 'red text only', 700, [], RED);
    });
    expect(texts(await extractHighlights(pdf))).toEqual([]);
  });
});
