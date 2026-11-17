import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { CardContent } from '../cards/cards';
import { IndexedDbStore } from '../store/indexedDbStore';
import { grade } from '../srs/scheduler';
import { MemoryRemote } from './memoryRemote';
import { syncOnce } from './sync';

let seq = 0;
const device = () => new IndexedDbStore(`sync-test-${seq++}`);
// 실제 시각보다 과거여야 한다. 동기화는 "마지막으로 올린 시각 이후 변경"을 실제 시계로 판정
const T0 = new Date(Date.now() - 3_600_000);
const doc = { id: 'doc', name: '판례.pdf', numPages: 1, highlightCount: 2 };
const createSampleContent = (id: string): CardContent => ({
  id, documentId: 'doc', highlightId: '1-0', type: 'cloze', page: 1, answer: id, before: '', after: '', keyLetters: '',
});

describe('syncOnce: 기기 2대', () => {
  it('A에서 올린 문서·카드·복습 기록이 B에 내려온다', async () => {
    const remote = new MemoryRemote();
    const [a, b] = [device(), device()];
    await a.importDocument(doc, [createSampleContent('c1'), createSampleContent('c2')], T0);
    await a.addReview({ cardId: 'c1', documentId: 'doc', grade: 3, previousState: 0, reviewedAt: T0 });

    expect(await syncOnce(a, remote)).toMatchObject({ pushed: 4 });
    await syncOnce(b, remote);

    expect((await b.listDocuments()).map((d) => d.name)).toEqual(['판례.pdf']);
    expect((await b.listCards()).map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    expect(await b.listReviewsSince(new Date(0))).toHaveLength(1);
  });

  it('두 번 동기화해도 복습 기록이 중복되지 않는다', async () => {
    const remote = new MemoryRemote();
    const a = device();
    await a.addReview({ cardId: 'c1', documentId: 'doc', grade: 3, previousState: 0, reviewedAt: T0 });
    await syncOnce(a, remote);
    expect(await syncOnce(a, remote)).toMatchObject({ pushed: 0 });
    expect(remote.reviews.size).toBe(1);
  });

  it('같은 카드를 양쪽에서 고치면 더 나중에 고친 쪽이 이긴다', async () => {
    const remote = new MemoryRemote();
    const [a, b] = [device(), device()];
    await a.importDocument(doc, [createSampleContent('c1')], T0);
    await syncOnce(a, remote);
    await syncOnce(b, remote);

    const [ca] = await a.listCards();
    await a.putCard({ ...ca, schedule: grade(ca.schedule, 3, T0).card });
    await new Promise((r) => setTimeout(r, 5));
    const [cb] = await b.listCards();
    await b.putCard({ ...cb, answer: 'B가 나중에 고침', edited: true });

    await syncOnce(a, remote);
    await syncOnce(b, remote);
    await syncOnce(a, remote);

    for (const s of [a, b]) expect((await s.listCards())[0].answer).toBe('B가 나중에 고침');
  });

  it('문서 삭제가 다른 기기에도 전파된다', async () => {
    const remote = new MemoryRemote();
    const [a, b] = [device(), device()];
    await a.importDocument(doc, [createSampleContent('c1')], T0);
    await a.addReview({ cardId: 'c1', documentId: 'doc', grade: 3, previousState: 0, reviewedAt: T0 });
    await syncOnce(a, remote);
    await syncOnce(b, remote);

    await a.deleteDocument('doc');
    await syncOnce(a, remote);
    await syncOnce(b, remote);

    expect(await b.listDocuments()).toEqual([]);
    expect(await b.listCards()).toEqual([]);
    expect(await b.listReviewsSince(new Date(0))).toEqual([]);
    expect(await a.pendingDeletions()).toEqual([]);
  });

  it('카드 삭제가 다른 기기에도 전파된다', async () => {
    const remote = new MemoryRemote();
    const [a, b] = [device(), device()];
    await a.importDocument(doc, [createSampleContent('c1'), createSampleContent('c2')], T0);
    await syncOnce(a, remote);
    await syncOnce(b, remote);

    await a.deleteCard('c1');
    await syncOnce(a, remote);
    await syncOnce(b, remote);
    expect((await b.listCards()).map((c) => c.id)).toEqual(['c2']);
  });

  it('로컬에서 지운 문서는 삭제를 올리기 전 pull로 되살아나지 않는다', async () => {
    const remote = new MemoryRemote();
    const [a, b] = [device(), device()];
    await a.importDocument(doc, [createSampleContent('c1')], T0);
    await syncOnce(a, remote);
    await syncOnce(b, remote); // b가 같은 행을 다시 올려 a의 pull에 다시 잡히는 상황

    await a.deleteDocument('doc');
    await syncOnce(a, remote);
    expect(await a.listDocuments()).toEqual([]);
    expect(await a.listCards()).toEqual([]);
  });

  it('지운 문서를 다시 올리면 되살아난다', async () => {
    const remote = new MemoryRemote();
    const [a, b] = [device(), device()];
    await a.importDocument(doc, [createSampleContent('c1')], T0);
    await syncOnce(a, remote);
    await a.deleteDocument('doc');
    await syncOnce(a, remote);

    await a.importDocument(doc, [createSampleContent('c1')], new Date());
    await syncOnce(a, remote);
    await syncOnce(b, remote);
    expect((await b.listCards()).map((c) => c.id)).toEqual(['c1']);
  });
});
