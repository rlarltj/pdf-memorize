/** FSRS 등급과 같은 값 (Again=1, Hard=2, Good=3, Easy=4) */
export type Grade = 1 | 2 | 3 | 4;

export const GRADES: { grade: Grade; label: string; className: string }[] = [
  { grade: 1, label: '다시', className: 'again' },
  { grade: 2, label: '어려움', className: 'hard' },
  { grade: 3, label: '알맞음', className: 'good' },
  { grade: 4, label: '쉬움', className: 'easy' },
];
