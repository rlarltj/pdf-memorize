import type { Deletion, DocumentRecord, RemoteChanges, ReviewRecord, StoredCard, StudyStore } from '../store/types';

export interface PushPayload {
  documents: DocumentRecord[];
  cards: StoredCard[];
  reviews: ReviewRecord[];
  deletions: Deletion[];
}

/** 원격 저장소. 실제 구현은 Supabase, 테스트는 메모리 가짜 구현 */
export interface RemoteApi {
  /** cursor 이후 서버에 반영된 변경. cursor는 원격 구현이 정하는 불투명한 문자열 */
  pull(cursor: string | undefined): Promise<{ changes: RemoteChanges; cursor: string | undefined }>;
  push(payload: PushPayload): Promise<void>;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
}

const PULL_CURSOR = 'sync.pullCursor';
const PUSHED_AT = 'sync.pushedAt';

/**
 * 한 번 동기화한다. pull(원격 → 로컬, 더 최근 것만 반영) 후 push(로컬 변경 → 원격).
 * pull을 먼저 해서 로컬이 "이긴 쪽"이 된 뒤에 올리므로, 다른 기기의 더 최근 수정을 덮어쓰지 않는다.
 */
export async function syncOnce(local: StudyStore, remote: RemoteApi, now = new Date()): Promise<SyncResult> {
  const { changes, cursor } = await remote.pull(await local.getMeta(PULL_CURSOR));
  await local.applyRemote(changes);
  if (cursor) await local.setMeta(PULL_CURSOR, cursor);

  const pushedAt = new Date((await local.getMeta(PUSHED_AT)) ?? 0);
  const [changed, reviews, deletions] = await Promise.all([local.changedSince(pushedAt), local.unsyncedReviews(), local.pendingDeletions()]);
  const payload: PushPayload = { ...changed, reviews, deletions };
  const pushed = payload.documents.length + payload.cards.length + payload.reviews.length + payload.deletions.length;
  if (pushed > 0) {
    await remote.push(payload);
    await local.markReviewsSynced(reviews.map((r) => r.id));
    await local.clearDeletions(deletions);
  }
  // 동기화 시작 시각으로 기록: 동기화 도중 바뀐 것은 다음에 다시 올라간다
  await local.setMeta(PUSHED_AT, now.toISOString());

  const pulled =
    changes.documents.length + changes.cards.length + changes.reviews.length + changes.deletedDocuments.length + changes.deletedCards.length;
  return { pulled, pushed };
}
