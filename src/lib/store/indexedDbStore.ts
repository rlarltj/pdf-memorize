import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { newSchedule } from '../srs/scheduler';
import type { CardContent } from '../cards/cards';
import type { DocumentRecord, ImportResult, ReviewRecord, StoredCard, StudyStore } from './types';

interface Schema extends DBSchema {
  documents: { key: string; value: DocumentRecord };
  cards: { key: string; value: StoredCard; indexes: { byDocument: string } };
  reviews: { key: number; value: ReviewRecord; indexes: { byReviewedAt: Date; byDocument: string } };
}

export class IndexedDbStore implements StudyStore {
  private db: Promise<IDBPDatabase<Schema>>;

  constructor(name = 'pdf-memorize') {
    this.db = openDB<Schema>(name, 1, {
      upgrade(db) {
        db.createObjectStore('documents', { keyPath: 'id' });
        db.createObjectStore('cards', { keyPath: 'id' }).createIndex('byDocument', 'documentId');
        const reviews = db.createObjectStore('reviews', { keyPath: 'id', autoIncrement: true });
        reviews.createIndex('byReviewedAt', 'reviewedAt');
        reviews.createIndex('byDocument', 'documentId');
      },
    });
  }

  async listDocuments() {
    const docs = await (await this.db).getAll('documents');
    return docs.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async importDocument(doc: Omit<DocumentRecord, 'createdAt' | 'updatedAt'>, cards: CardContent[], now: Date): Promise<ImportResult> {
    const db = await this.db;
    const tx = db.transaction(['documents', 'cards'], 'readwrite');
    const existingDoc = await tx.objectStore('documents').get(doc.id);
    await tx.objectStore('documents').put({ ...doc, createdAt: existingDoc?.createdAt ?? now, updatedAt: now });

    const result: ImportResult = { added: 0, updated: 0, kept: 0 };
    const cardStore = tx.objectStore('cards');
    for (const c of cards) {
      const prev = await cardStore.get(c.id);
      if (!prev) {
        await cardStore.put({ ...c, schedule: newSchedule(now), suspended: false, edited: false, createdAt: now });
        result.added++;
      } else if (prev.edited) {
        result.kept++;
      } else {
        await cardStore.put({ ...prev, ...c });
        result.updated++;
      }
    }
    await tx.done;
    return result;
  }

  async deleteDocument(id: string) {
    const db = await this.db;
    const tx = db.transaction(['documents', 'cards', 'reviews'], 'readwrite');
    await tx.objectStore('documents').delete(id);
    for (const key of await tx.objectStore('cards').index('byDocument').getAllKeys(id)) await tx.objectStore('cards').delete(key);
    for (const key of await tx.objectStore('reviews').index('byDocument').getAllKeys(id)) await tx.objectStore('reviews').delete(key);
    await tx.done;
  }

  async listCards(documentId?: string) {
    const db = await this.db;
    return documentId ? db.getAllFromIndex('cards', 'byDocument', documentId) : db.getAll('cards');
  }

  async putCard(card: StoredCard) {
    await (await this.db).put('cards', card);
  }

  async deleteCard(id: string) {
    await (await this.db).delete('cards', id);
  }

  async addReview(review: ReviewRecord) {
    const { id: _ignored, ...rest } = review;
    void _ignored;
    await (await this.db).add('reviews', rest as ReviewRecord);
  }

  async listReviewsSince(since: Date) {
    return (await this.db).getAllFromIndex('reviews', 'byReviewedAt', IDBKeyRange.lowerBound(since));
  }
}
