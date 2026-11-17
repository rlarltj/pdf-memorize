import type { SupabaseClient } from '@supabase/supabase-js';
import type { RemoteChanges } from '../store/types';
import {
  cardToRow, documentToRow, reviewToRow, rowToCard, rowToDocument, rowToReview,
  type CardRow, type DocumentRow, type ReviewRow,
} from './rows';
import type { PushPayload, RemoteApi } from './sync';

const PAGE = 1000;
const CHUNK = 500;

type Table = 'documents' | 'cards' | 'reviews';
/** 테이블별 마지막으로 받은 행 (server_updated_at, id). keyset 페이지네이션 커서 */
type Cursor = Partial<Record<Table, { at: string; id: string }>>;

const chunks = <T>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) => xs.slice(i * CHUNK, (i + 1) * CHUNK));
// PostgREST or 필터 안에서 ':' '+' ',' 를 쓰려면 큰따옴표로 감싼다
const q = (v: string) => `"${v.replace(/"/g, '\\"')}"`;

export class SupabaseRemote implements RemoteApi {
  constructor(private client: SupabaseClient, private userId: string) {}

  private async pullTable<R extends { id: string; server_updated_at?: string }>(table: Table, cursor: Cursor): Promise<R[]> {
    const out: R[] = [];
    let after = cursor[table];
    for (;;) {
      let query = this.client.from(table).select('*').order('server_updated_at').order('id').limit(PAGE);
      // 같은 트랜잭션에서 들어간 행은 server_updated_at이 같으므로 (시각, id) 순서로 이어 받는다
      if (after) query = query.or(`server_updated_at.gt.${q(after.at)},and(server_updated_at.eq.${q(after.at)},id.gt.${q(after.id)})`);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as R[];
      out.push(...rows);
      if (rows.length > 0) {
        const last = rows[rows.length - 1];
        after = { at: last.server_updated_at!, id: last.id };
        cursor[table] = after;
      }
      if (rows.length < PAGE) return out;
    }
  }

  async pull(raw: string | undefined) {
    const cursor: Cursor = raw ? JSON.parse(raw) : {};
    const docs = await this.pullTable<DocumentRow>('documents', cursor);
    const cards = await this.pullTable<CardRow>('cards', cursor);
    const reviews = await this.pullTable<ReviewRow>('reviews', cursor);
    const changes: RemoteChanges = {
      documents: docs.filter((r) => !r.deleted_at).map(rowToDocument),
      cards: cards.filter((r) => !r.deleted_at).map(rowToCard),
      reviews: reviews.map(rowToReview),
      deletedDocuments: docs.filter((r) => r.deleted_at).map((r) => ({ id: r.id, deletedAt: new Date(r.deleted_at!) })),
      deletedCards: cards.filter((r) => r.deleted_at).map((r) => ({ id: r.id, deletedAt: new Date(r.deleted_at!) })),
    };
    return { changes, cursor: JSON.stringify(cursor) };
  }

  async push(p: PushPayload) {
    const c = this.client;
    const check = ({ error }: { error: unknown }) => {
      if (error) throw error;
    };

    // 삭제를 먼저 반영해야, 같은 대상을 다시 만든 경우 뒤의 upsert가 되살린다
    for (const d of p.deletions) {
      const mark = { deleted_at: d.deletedAt.toISOString(), updated_at: d.deletedAt.toISOString() };
      if (d.kind === 'document') {
        check(await c.from('documents').update(mark).eq('id', d.id));
        check(await c.from('cards').update(mark).eq('document_id', d.id).is('deleted_at', null));
        check(await c.from('reviews').delete().eq('document_id', d.id));
      } else {
        check(await c.from('cards').update(mark).eq('id', d.id));
      }
    }
    for (const rows of chunks(p.documents.map((d) => documentToRow(d, this.userId)))) {
      check(await c.from('documents').upsert(rows, { onConflict: 'user_id,id' }));
    }
    for (const rows of chunks(p.cards.map((x) => cardToRow(x, this.userId)))) {
      check(await c.from('cards').upsert(rows, { onConflict: 'user_id,id' }));
    }
    for (const rows of chunks(p.reviews.map((r) => reviewToRow(r, this.userId)))) {
      check(await c.from('reviews').upsert(rows, { onConflict: 'user_id,id', ignoreDuplicates: true }));
    }
  }
}
