import type { DocumentRecord, ReviewRecord, StoredCard } from '../store/types';
import type { PushPayload, RemoteApi } from './sync';

type Row<T> = { value: T; deletedAt?: Date; seq: number };

/**
 * Supabase 테이블의 동작(서버 시각 커서, deleted_at, upsert)을 흉내 낸 메모리 구현. 테스트 전용.
 * 서버 시각 대신 증가하는 순번(seq)을 커서로 쓴다.
 */
export class MemoryRemote implements RemoteApi {
  private seq = 0;
  documents = new Map<string, Row<DocumentRecord>>();
  cards = new Map<string, Row<StoredCard>>();
  reviews = new Map<string, Row<ReviewRecord>>();

  async pull(cursor: string | undefined) {
    const after = Number(cursor ?? 0);
    const changed = <T>(m: Map<string, Row<T>>) => [...m.values()].filter((r) => r.seq > after);
    const docs = changed(this.documents);
    const cards = changed(this.cards);
    return {
      changes: {
        documents: docs.filter((r) => !r.deletedAt).map((r) => structuredClone(r.value)),
        cards: cards.filter((r) => !r.deletedAt).map((r) => structuredClone(r.value)),
        reviews: changed(this.reviews).map((r) => structuredClone(r.value)),
        deletedDocuments: docs.filter((r) => r.deletedAt).map((r) => ({ id: r.value.id, deletedAt: r.deletedAt! })),
        deletedCards: cards.filter((r) => r.deletedAt).map((r) => ({ id: r.value.id, deletedAt: r.deletedAt! })),
      },
      cursor: String(this.seq),
    };
  }

  async push(p: PushPayload) {
    for (const d of p.deletions) {
      if (d.kind === 'document') {
        this.markDeleted(this.documents, d.id, d.deletedAt);
        for (const [id, c] of this.cards) if (c.value.documentId === d.id) this.markDeleted(this.cards, id, d.deletedAt);
        for (const [id, r] of this.reviews) if (r.value.documentId === d.id) this.reviews.delete(id);
      } else {
        this.markDeleted(this.cards, d.id, d.deletedAt);
      }
    }
    for (const d of p.documents) this.documents.set(d.id, { value: structuredClone(d), seq: ++this.seq });
    for (const c of p.cards) this.cards.set(c.id, { value: structuredClone(c), seq: ++this.seq });
    for (const r of p.reviews) if (!this.reviews.has(r.id)) this.reviews.set(r.id, { value: structuredClone(r), seq: ++this.seq });
  }

  private markDeleted<T>(m: Map<string, Row<T>>, id: string, at: Date) {
    const row = m.get(id);
    if (row) m.set(id, { ...row, deletedAt: at, seq: ++this.seq });
  }
}
