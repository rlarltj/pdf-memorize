import type { CardContent } from '../cards/cards';
import type { FsrsCard } from '../srs/scheduler';
import type { DocumentRecord, ReviewRecord, StoredCard } from '../store/types';
import type { Grade } from '../cards/grades';

/** supabase/migrations의 테이블 행. 날짜는 ISO 문자열로 오간다 */
export interface DocumentRow {
  user_id: string;
  id: string;
  name: string;
  num_pages: number;
  highlight_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_updated_at?: string;
}

export interface CardRow {
  user_id: string;
  id: string;
  document_id: string;
  content: Omit<CardContent, 'id' | 'documentId'>;
  schedule: Record<string, unknown>;
  suspended: boolean;
  edited: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_updated_at?: string;
}

export interface ReviewRow {
  user_id: string;
  id: string;
  card_id: string;
  document_id: string;
  grade: number;
  previous_state: number;
  reviewed_at: string;
  server_updated_at?: string;
}

export const documentToRow = (d: DocumentRecord, userId: string): DocumentRow => ({
  user_id: userId,
  id: d.id,
  name: d.name,
  num_pages: d.numPages,
  highlight_count: d.highlightCount,
  created_at: d.createdAt.toISOString(),
  updated_at: d.updatedAt.toISOString(),
  deleted_at: null,
});

export const rowToDocument = (r: DocumentRow): DocumentRecord => ({
  id: r.id,
  name: r.name,
  numPages: r.num_pages,
  highlightCount: r.highlight_count,
  createdAt: new Date(r.created_at),
  updatedAt: new Date(r.updated_at),
});

/** FSRS 카드는 JSON을 거치면 날짜가 문자열이 되므로 되돌린다 */
function reviveSchedule(s: Record<string, unknown>): FsrsCard {
  return {
    ...(s as unknown as FsrsCard),
    due: new Date(s.due as string),
    last_review: s.last_review ? new Date(s.last_review as string) : undefined,
  };
}

export const cardToRow = (c: StoredCard, userId: string): CardRow => {
  const { id, documentId, schedule, suspended, edited, createdAt, updatedAt, ...content } = c;
  return {
    user_id: userId,
    id,
    document_id: documentId,
    content,
    schedule: JSON.parse(JSON.stringify(schedule)),
    suspended,
    edited,
    created_at: createdAt.toISOString(),
    updated_at: updatedAt.toISOString(),
    deleted_at: null,
  };
};

export const rowToCard = (r: CardRow): StoredCard => ({
  ...r.content,
  id: r.id,
  documentId: r.document_id,
  schedule: reviveSchedule(r.schedule),
  suspended: r.suspended,
  edited: r.edited,
  createdAt: new Date(r.created_at),
  updatedAt: new Date(r.updated_at),
});

export const reviewToRow = (r: ReviewRecord, userId: string): ReviewRow => ({
  user_id: userId,
  id: r.id,
  card_id: r.cardId,
  document_id: r.documentId,
  grade: r.grade,
  previous_state: r.previousState,
  reviewed_at: r.reviewedAt.toISOString(),
});

export const rowToReview = (r: ReviewRow): ReviewRecord => ({
  id: r.id,
  cardId: r.card_id,
  documentId: r.document_id,
  grade: r.grade as Grade,
  previousState: r.previous_state,
  reviewedAt: new Date(r.reviewed_at),
});
