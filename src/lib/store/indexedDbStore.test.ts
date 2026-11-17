import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { CardContent } from '../cards/cards';
import { IndexedDbStore } from './indexedDbStore';

const NOW = new Date('2026-11-18T09:00:00');
let dbSeq = 0;
const freshStore = () => new IndexedDbStore(`test-${dbSeq++}`);

const doc = { id: 'doc', name: '판례.pdf', numPages: 2, highlightCount: 2 };
const createSampleContent = (id: string, answer = '근본정신'): CardContent => ({
  id, documentId: 'doc', highlightId: '1-0', type: 'cloze', page: 1, answer, before: '', after: '', keyLetters: '',
});

describe('IndexedDbStore', () => {
  it('문서를 처음 저장하면 카드를 새 카드 상태로 만든다', async () => {
    const store = freshStore();
    expect(await store.importDocument(doc, [createSampleContent('a'), createSampleContent('b')], NOW)).toEqual({ added: 2, updated: 0, kept: 0 });
    const cards = await store.listCards('doc');
    expect(cards).toHaveLength(2);
    expect(cards[0].schedule.state).toBe(0);
  });

  it('같은 문서를 다시 저장하면 복습 일정은 유지하고, 사용자가 고친 카드는 덮어쓰지 않는다', async () => {
    const store = freshStore();
    await store.importDocument(doc, [createSampleContent('a'), createSampleContent('b')], NOW);
    const [a, b] = await store.listCards('doc');
    await store.putCard({ ...a, schedule: { ...a.schedule, reps: 5 } });
    await store.putCard({ ...b, answer: '직접 고침', edited: true });

    const r = await store.importDocument(doc, [createSampleContent('a', '새 추출'), createSampleContent('b', '새 추출')], NOW);
    expect(r).toEqual({ added: 0, updated: 1, kept: 1 });
    const after = Object.fromEntries((await store.listCards('doc')).map((c) => [c.id, c]));
    expect(after.a).toMatchObject({ answer: '새 추출', schedule: expect.objectContaining({ reps: 5 }) });
    expect(after.b.answer).toBe('직접 고침');
  });

  it('문서를 지우면 카드와 복습 기록도 지운다', async () => {
    const store = freshStore();
    await store.importDocument(doc, [createSampleContent('a')], NOW);
    await store.addReview({ cardId: 'a', documentId: 'doc', grade: 3, previousState: 0, reviewedAt: NOW });
    await store.deleteDocument('doc');
    expect(await store.listDocuments()).toEqual([]);
    expect(await store.listCards()).toEqual([]);
    expect(await store.listReviewsSince(new Date(0))).toEqual([]);
  });

  it('기간 이후 복습 기록만 가져온다', async () => {
    const store = freshStore();
    await store.addReview({ cardId: 'a', documentId: 'doc', grade: 3, previousState: 0, reviewedAt: new Date('2026-11-17T09:00:00') });
    await store.addReview({ cardId: 'b', documentId: 'doc', grade: 3, previousState: 0, reviewedAt: NOW });
    expect((await store.listReviewsSince(new Date('2026-11-18T00:00:00'))).map((r) => r.cardId)).toEqual(['b']);
  });

  it('원본 PDF와 빈칸 설정을 저장하고, 문서를 지우면 함께 지운다', async () => {
    const store = freshStore();
    await store.importDocument(doc, [createSampleContent('a')], NOW);
    await store.putFile('doc', new Uint8Array([1, 2, 3]).buffer);
    expect(await store.getBlankSettings('doc')).toMatchObject({ excluded: [] });
    await store.putBlankSettings({ documentId: 'doc', excluded: ['2:abc'], updatedAt: NOW });

    expect(new Uint8Array((await store.getFile('doc'))!.data)).toEqual(new Uint8Array([1, 2, 3]));
    expect((await store.getBlankSettings('doc')).excluded).toEqual(['2:abc']);

    await store.deleteDocument('doc');
    expect(await store.getFile('doc')).toBeUndefined();
    expect((await store.getBlankSettings('doc')).excluded).toEqual([]);
  });
});
