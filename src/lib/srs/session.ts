import { State } from './scheduler';
import type { ReviewRecord, StoredCard } from '../store/types';

/** 하루에 새로 보는 카드 수. Anki 기본값과 같은 20 (결정 대기) */
export const NEW_CARDS_PER_DAY = 20;
/** 이 시간 안에 다시 볼 카드는 세션 안에서 바로 다시 보여 준다 (학습 단계의 1분·10분 간격) */
export const LEARN_AHEAD_MS = 20 * 60_000;

export const startOfDay = (now: Date) => new Date(now.getFullYear(), now.getMonth(), now.getDate());

export interface DailySummary {
  /** 지금 복습할 카드 (이미 본 적 있는 카드) */
  due: number;
  /** 오늘 더 볼 수 있는 새 카드 */
  newAvailable: number;
  /** 오늘 복습한 횟수 */
  reviewedToday: number;
}

const isNew = (c: StoredCard) => c.schedule.state === State.New;

export function newIntroducedToday(reviewsToday: ReviewRecord[]): number {
  return new Set(reviewsToday.filter((r) => r.previousState === State.New).map((r) => r.cardId)).size;
}

/**
 * 오늘의 학습 큐: 복습할 카드(복습 예정 시각 순) 다음에 새 카드(문서·페이지 순)를 하루 한도까지.
 */
export function buildQueue(cards: StoredCard[], reviewsToday: ReviewRecord[], now: Date, newPerDay = NEW_CARDS_PER_DAY): StoredCard[] {
  const active = cards.filter((c) => !c.suspended);
  const due = active
    .filter((c) => !isNew(c) && c.schedule.due.getTime() <= now.getTime())
    .sort((a, b) => a.schedule.due.getTime() - b.schedule.due.getTime());
  const newLimit = Math.max(0, newPerDay - newIntroducedToday(reviewsToday));
  const fresh = active
    .filter(isNew)
    .sort((a, b) => a.documentId.localeCompare(b.documentId) || a.page - b.page || a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, newLimit);
  return [...due, ...fresh];
}

export function summarize(cards: StoredCard[], reviewsToday: ReviewRecord[], now: Date, newPerDay = NEW_CARDS_PER_DAY): DailySummary {
  const queue = buildQueue(cards, reviewsToday, now, newPerDay);
  return {
    due: queue.filter((c) => !isNew(c)).length,
    newAvailable: queue.filter(isNew).length,
    reviewedToday: reviewsToday.length,
  };
}

/** 등급을 매긴 뒤 큐 갱신: 곧 다시 볼 카드(학습 단계)는 맨 뒤로, 나머지는 이번 세션에서 뺀다 */
export function advanceQueue(queue: StoredCard[], updated: StoredCard, now: Date): StoredCard[] {
  const rest = queue.filter((c) => c.id !== updated.id);
  return updated.schedule.due.getTime() - now.getTime() <= LEARN_AHEAD_MS ? [...rest, updated] : rest;
}
