import { createEmptyCard, fsrs, State, type Card as FsrsCard, type Grade as FsrsGrade, type ReviewLog } from 'ts-fsrs';
import type { Grade } from '../cards/grades';

export type { FsrsCard, ReviewLog };
export { State };

// 목표 기억률 90%는 FSRS 기본값. 시험 대비면 높이는 것을 검토 (결정 대기)
const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: true });

export const newSchedule = (now: Date): FsrsCard => createEmptyCard(now);

export function grade(card: FsrsCard, g: Grade, now: Date): { card: FsrsCard; log: ReviewLog } {
  return scheduler.next(card, now, g as FsrsGrade);
}

/** 등급별 다음 복습까지 남은 시간 (버튼 아래 표시용) */
export function previewIntervals(card: FsrsCard, now: Date): Record<Grade, string> {
  const out = {} as Record<Grade, string>;
  for (const g of [1, 2, 3, 4] as Grade[]) {
    out[g] = formatInterval(scheduler.next(card, now, g as FsrsGrade).card.due.getTime() - now.getTime());
  }
  return out;
}

export function formatInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min}분`;
  const hour = Math.round(min / 60);
  if (hour < 24) return `${hour}시간`;
  const day = Math.round(hour / 24);
  if (day < 31) return `${day}일`;
  const month = Math.round(day / 30);
  if (month < 12) return `${month}개월`;
  return `${(day / 365).toFixed(1)}년`;
}
