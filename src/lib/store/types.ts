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
  /** 마지막 수정 시각(클라이언트). 동기화 충돌 시 더 최근 것이 이긴다 */
  updatedAt: Date;
}

export interface StoredCard extends CardContent {
  schedule: FsrsCard;
  /** 학습에서 제외 */
  suspended: boolean;
  /** 사용자가 정답 문구를 고쳤는지. 재추출 시 덮어쓰지 않는다 */
  edited: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewRecord {
  /** 클라이언트가 만든 UUID. 동기화로 다시 보내도 중복되지 않는다 */
  id: string;
  cardId: string;
  documentId: string;
  grade: Grade;
  /** 복습 전 상태 (New=0이면 새 카드를 처음 본 것) */
  previousState: number;
  reviewedAt: Date;
}

/** 원본 PDF. 원문 보기용으로 이 브라우저에만 저장하고 동기화하지 않는다 (ADR pdf-client-side-only) */
export interface StoredFile {
  documentId: string;
  data: ArrayBuffer;
  savedAt: Date;
}

/**
 * 원문 보기의 빈칸 설정. 색 단위로 정하고, 하이라이트 단위로 예외를 둔다 (판정은 lib/blanks).
 * 키는 highlightKey (`${page}:${문구 해시}`)
 */
export interface BlankSettings {
  documentId: string;
  /** 빈칸으로 쓸 하이라이트 대표 색. 없으면 모든 색 */
  colors?: string[];
  /** 색과 관계없이 빈칸에서 뺀 하이라이트 */
  excluded: string[];
  /** 색과 관계없이 빈칸으로 넣은 하이라이트 */
  included?: string[];
  updatedAt: Date;
}

export interface ImportResult {
  added: number;
  updated: number;
  kept: number;
}

/** 아직 서버에 알리지 않은 삭제 */
export interface Deletion {
  kind: 'document' | 'card';
  id: string;
  deletedAt: Date;
}

export interface Tombstone {
  id: string;
  deletedAt: Date;
}

/** 원격에서 받아 로컬에 반영할 변경 */
export interface RemoteChanges {
  documents: DocumentRecord[];
  cards: StoredCard[];
  reviews: ReviewRecord[];
  /** 원격에서 지워진 대상과 지운 시각. 로컬이 그 뒤에 다시 만들었으면 지우지 않는다 */
  deletedDocuments: Tombstone[];
  deletedCards: Tombstone[];
}

/**
 * 학습 데이터 저장소. 로컬(IndexedDB)이 기본이고, 로그인하면 동기화 엔진이 원격과 맞춘다.
 * 화면 코드는 이 인터페이스의 앞부분만 쓴다. 뒷부분(동기화용)은 sync 엔진 전용.
 */
export interface StudyStore {
  listDocuments(): Promise<DocumentRecord[]>;
  /** 문서와 카드를 저장한다. 이미 있는 카드는 복습 일정과 사용자 수정을 유지하고 내용만 갱신한다 */
  importDocument(doc: Omit<DocumentRecord, 'createdAt' | 'updatedAt'>, cards: CardContent[], now: Date): Promise<ImportResult>;
  deleteDocument(id: string): Promise<void>;
  listCards(documentId?: string): Promise<StoredCard[]>;
  /** 카드를 저장하고 updatedAt을 갱신한다 */
  putCard(card: StoredCard): Promise<void>;
  deleteCard(id: string): Promise<void>;
  addReview(review: Omit<ReviewRecord, 'id'>): Promise<void>;
  listReviewsSince(since: Date): Promise<ReviewRecord[]>;

  getFile(documentId: string): Promise<StoredFile | undefined>;
  putFile(documentId: string, data: ArrayBuffer): Promise<void>;
  getBlankSettings(documentId: string): Promise<BlankSettings>;
  putBlankSettings(settings: BlankSettings): Promise<void>;

  // --- 동기화용 ---
  changedSince(since: Date): Promise<{ documents: DocumentRecord[]; cards: StoredCard[] }>;
  unsyncedReviews(): Promise<ReviewRecord[]>;
  markReviewsSynced(ids: string[]): Promise<void>;
  pendingDeletions(): Promise<Deletion[]>;
  clearDeletions(deletions: Deletion[]): Promise<void>;
  /** 원격 변경을 반영한다. 더 최근(updatedAt) 것만 덮어쓰고, 삭제 기록은 남기지 않는다 */
  applyRemote(changes: RemoteChanges): Promise<void>;
  getMeta(key: string): Promise<string | undefined>;
  setMeta(key: string, value: string): Promise<void>;
  /** 로그아웃 등으로 동기화 상태를 처음부터 다시 시작할 때 */
  resetSyncState(): Promise<void>;
}
