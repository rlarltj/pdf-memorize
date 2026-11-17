import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { newSchedule } from '../srs/scheduler';
import type { CardContent } from '../cards/cards';
import type { BlankSettings, Deletion, DocumentRecord, ImportResult, RemoteChanges, ReviewRecord, StoredCard, StoredFile, StudyStore } from './types';

/** synced: 0=아직 원격에 안 올림, 1=올림. IndexedDB는 boolean을 인덱스로 못 써서 숫자 */
type LocalReview = ReviewRecord & { synced: 0 | 1 };

interface Schema extends DBSchema {
  documents: { key: string; value: DocumentRecord };
  cards: { key: string; value: StoredCard; indexes: { byDocument: string } };
  reviews: { key: string; value: LocalReview; indexes: { byReviewedAt: Date; byDocument: string; bySynced: number } };
  deletions: { key: string; value: Deletion };
  meta: { key: string; value: string };
  files: { key: string; value: StoredFile };
  blanks: { key: string; value: BlankSettings };
}

const deletionKey = (d: Pick<Deletion, 'kind' | 'id'>) => `${d.kind}:${d.id}`;
const stripLocal = ({ synced: _s, ...r }: LocalReview): ReviewRecord => (void _s, r);

export class IndexedDbStore implements StudyStore {
  private db: Promise<IDBPDatabase<Schema>>;

  constructor(name = 'pdf-memorize') {
    this.db = openDB<Schema>(name, 3, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('documents', { keyPath: 'id' });
          db.createObjectStore('cards', { keyPath: 'id' }).createIndex('byDocument', 'documentId');
        }
        if (oldVersion < 2) {
          // v1 복습 기록은 숫자 id라 동기화할 수 없어 새로 만든다 (배포 전 개발 데이터만 존재)
          if (oldVersion >= 1) db.deleteObjectStore('reviews' as never);
          const reviews = db.createObjectStore('reviews', { keyPath: 'id' });
          reviews.createIndex('byReviewedAt', 'reviewedAt');
          reviews.createIndex('byDocument', 'documentId');
          reviews.createIndex('bySynced', 'synced');
          db.createObjectStore('deletions');
          db.createObjectStore('meta');
        }
        if (oldVersion < 3) {
          db.createObjectStore('files', { keyPath: 'documentId' });
          db.createObjectStore('blanks', { keyPath: 'documentId' });
        }
      },
    });
  }

  async listDocuments() {
    const docs = await (await this.db).getAll('documents');
    return docs.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async importDocument(doc: Omit<DocumentRecord, 'createdAt' | 'updatedAt'>, cards: CardContent[], now: Date): Promise<ImportResult> {
    const db = await this.db;
    const tx = db.transaction(['documents', 'cards', 'deletions'], 'readwrite');
    const existingDoc = await tx.objectStore('documents').get(doc.id);
    await tx.objectStore('documents').put({ ...doc, createdAt: existingDoc?.createdAt ?? now, updatedAt: now });
    // 지웠던 문서를 다시 올리면 삭제 기록을 취소한다
    await tx.objectStore('deletions').delete(deletionKey({ kind: 'document', id: doc.id }));

    const result: ImportResult = { added: 0, updated: 0, kept: 0 };
    const cardStore = tx.objectStore('cards');
    for (const c of cards) {
      const prev = await cardStore.get(c.id);
      if (!prev) {
        await cardStore.put({ ...c, schedule: newSchedule(now), suspended: false, edited: false, createdAt: now, updatedAt: now });
        result.added++;
      } else if (prev.edited) {
        result.kept++;
      } else {
        await cardStore.put({ ...prev, ...c, updatedAt: now });
        result.updated++;
      }
    }
    await tx.done;
    return result;
  }

  async deleteDocument(id: string) {
    await this.removeDocument(id);
    await (await this.db).put('deletions', { kind: 'document', id, deletedAt: new Date() }, deletionKey({ kind: 'document', id }));
  }

  private async removeDocument(id: string) {
    const db = await this.db;
    const tx = db.transaction(['documents', 'cards', 'reviews', 'files', 'blanks'], 'readwrite');
    await tx.objectStore('documents').delete(id);
    await tx.objectStore('files').delete(id);
    await tx.objectStore('blanks').delete(id);
    for (const key of await tx.objectStore('cards').index('byDocument').getAllKeys(id)) await tx.objectStore('cards').delete(key);
    for (const key of await tx.objectStore('reviews').index('byDocument').getAllKeys(id)) await tx.objectStore('reviews').delete(key);
    await tx.done;
  }

  async listCards(documentId?: string) {
    const db = await this.db;
    return documentId ? db.getAllFromIndex('cards', 'byDocument', documentId) : db.getAll('cards');
  }

  async putCard(card: StoredCard) {
    await (await this.db).put('cards', { ...card, updatedAt: new Date() });
  }

  async deleteCard(id: string) {
    const db = await this.db;
    await db.delete('cards', id);
    await db.put('deletions', { kind: 'card', id, deletedAt: new Date() }, deletionKey({ kind: 'card', id }));
  }

  async addReview(review: Omit<ReviewRecord, 'id'>) {
    await (await this.db).put('reviews', { ...review, id: crypto.randomUUID(), synced: 0 });
  }

  async listReviewsSince(since: Date) {
    return (await (await this.db).getAllFromIndex('reviews', 'byReviewedAt', IDBKeyRange.lowerBound(since))).map(stripLocal);
  }

  async getFile(documentId: string) {
    return (await this.db).get('files', documentId);
  }

  async putFile(documentId: string, data: ArrayBuffer) {
    await (await this.db).put('files', { documentId, data, savedAt: new Date() });
  }

  async getBlankSettings(documentId: string) {
    return (await (await this.db).get('blanks', documentId)) ?? { documentId, excluded: [], updatedAt: new Date(0) };
  }

  async putBlankSettings(settings: BlankSettings) {
    await (await this.db).put('blanks', { ...settings, updatedAt: new Date() });
  }

  // --- 동기화용 ---

  async changedSince(since: Date) {
    const db = await this.db;
    // 같은 밀리초에 바뀐 행을 놓치지 않도록 경계를 포함한다. 한 번 더 올라가는 것은 문제없다 (2026-11-18 Node 22에서 발견)
    const after = (r: { updatedAt: Date }) => r.updatedAt.getTime() >= since.getTime();
    const [documents, cards] = await Promise.all([db.getAll('documents'), db.getAll('cards')]);
    return { documents: documents.filter(after), cards: cards.filter(after) };
  }

  async unsyncedReviews() {
    return (await (await this.db).getAllFromIndex('reviews', 'bySynced', 0)).map(stripLocal);
  }

  async markReviewsSynced(ids: string[]) {
    const tx = (await this.db).transaction('reviews', 'readwrite');
    for (const id of ids) {
      const r = await tx.store.get(id);
      if (r) await tx.store.put({ ...r, synced: 1 });
    }
    await tx.done;
  }

  async pendingDeletions() {
    return (await this.db).getAll('deletions');
  }

  async clearDeletions(deletions: Deletion[]) {
    const tx = (await this.db).transaction('deletions', 'readwrite');
    for (const d of deletions) {
      // 올리는 사이에 같은 대상을 다시 지웠으면 그 기록은 남긴다
      const current = await tx.store.get(deletionKey(d));
      if (current && current.deletedAt.getTime() === d.deletedAt.getTime()) await tx.store.delete(deletionKey(d));
    }
    await tx.done;
  }

  async applyRemote(changes: RemoteChanges) {
    const db = await this.db;
    for (const t of changes.deletedDocuments) {
      const local = await db.get('documents', t.id);
      // 같은 밀리초면 로컬을 남긴다: 삭제 직후 다시 올린 경우가 더 흔하다 (2026-11-18 Node 22에서 테스트 실패로 발견)
      if (!local || local.updatedAt.getTime() < t.deletedAt.getTime()) await this.removeDocument(t.id);
    }
    // 로컬에서 지웠지만 아직 원격에 알리지 않은 대상은 되살리지 않는다
    const pending = await db.getAll('deletions');
    const deletedDocs = new Set(pending.filter((d) => d.kind === 'document').map((d) => d.id));
    const deletedCards = new Set(pending.filter((d) => d.kind === 'card').map((d) => d.id));
    const tx = db.transaction(['documents', 'cards', 'reviews'], 'readwrite');
    const newer = (local: { updatedAt: Date } | undefined, remote: { updatedAt: Date }) =>
      !local || remote.updatedAt.getTime() > local.updatedAt.getTime();

    for (const d of changes.documents) {
      if (deletedDocs.has(d.id)) continue;
      if (newer(await tx.objectStore('documents').get(d.id), d)) await tx.objectStore('documents').put(d);
    }
    for (const t of changes.deletedCards) {
      const local = await tx.objectStore('cards').get(t.id);
      if (local && local.updatedAt.getTime() < t.deletedAt.getTime()) await tx.objectStore('cards').delete(t.id);
    }
    for (const c of changes.cards) {
      if (deletedCards.has(c.id) || deletedDocs.has(c.documentId)) continue;
      if (newer(await tx.objectStore('cards').get(c.id), c)) await tx.objectStore('cards').put(c);
    }
    for (const r of changes.reviews) {
      if (deletedDocs.has(r.documentId)) continue;
      if (!(await tx.objectStore('reviews').get(r.id))) await tx.objectStore('reviews').put({ ...r, synced: 1 });
    }
    await tx.done;
  }

  async getMeta(key: string) {
    return (await this.db).get('meta', key);
  }

  async setMeta(key: string, value: string) {
    await (await this.db).put('meta', value, key);
  }

  async resetSyncState() {
    const db = await this.db;
    await db.clear('meta');
    const tx = db.transaction('reviews', 'readwrite');
    for (const r of await tx.store.getAll()) await tx.store.put({ ...r, synced: 0 });
    await tx.done;
  }
}
