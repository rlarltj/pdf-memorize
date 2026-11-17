import type { CardContent } from '../cards/cards';
import type { Grade } from '../cards/grades';
import type { FsrsCard } from '../srs/scheduler';

export interface DocumentRecord {
  /** 파일 내용의 SHA-256. 같은 파일은 이름이 달라도 같은 문서 */
  id: string;
  name: string;
  numPages: number;
  highlightCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredCard extends CardContent {
  schedule: FsrsCard;
  /** 학습에서 제외 */
  suspended: boolean;
  /** 사용자가 정답 문구를 고쳤는지. 재추출 시 덮어쓰지 않는다 */
  edited: boolean;
  createdAt: Date;
}

export interface ReviewRecord {
  id?: number;
  cardId: string;
  documentId: string;
  grade: Grade;
  /** 복습 전 상태 (New=0이면 새 카드를 처음 본 것) */
  previousState: number;
  reviewedAt: Date;
}

export interface ImportResult {
  added: number;
  updated: number;
  kept: number;
}

/**
 * 학습 데이터 저장소. 지금은 IndexedDB 구현만 있고, 로그인하면 Supabase 구현으로 동기화한다.
 */
export interface StudyStore {
  listDocuments(): Promise<DocumentRecord[]>;
  /** 문서와 카드를 저장한다. 이미 있는 카드는 복습 기록과 사용자 수정을 유지하고 내용만 갱신한다 */
  importDocument(doc: Omit<DocumentRecord, 'createdAt' | 'updatedAt'>, cards: CardContent[], now: Date): Promise<ImportResult>;
  deleteDocument(id: string): Promise<void>;
  listCards(documentId?: string): Promise<StoredCard[]>;
  putCard(card: StoredCard): Promise<void>;
  deleteCard(id: string): Promise<void>;
  addReview(review: ReviewRecord): Promise<void>;
  listReviewsSince(since: Date): Promise<ReviewRecord[]>;
}
