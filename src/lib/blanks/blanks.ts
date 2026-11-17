import type { BlankSettings } from '../store/types';

/**
 * 원문 보기에서 하이라이트가 빈칸인지 정한다.
 * 1. 하이라이트를 직접 눌러 바꾼 설정(included/excluded)이 가장 우선
 * 2. 그 외에는 하이라이트 대표 색이 빈칸 색으로 켜져 있는지 (colors가 없으면 모든 색)
 */
export function isBlank(settings: Pick<BlankSettings, 'colors' | 'excluded' | 'included'>, key: string, mainColor: string): boolean {
  if (settings.included?.includes(key)) return true;
  if (settings.excluded.includes(key)) return false;
  return colorOn(settings, mainColor);
}

export function colorOn(settings: Pick<BlankSettings, 'colors'>, color: string): boolean {
  return !settings.colors || settings.colors.includes(color);
}

/** 하이라이트 하나를 빈칸 ↔ 빈칸 아님으로 바꾼다. 색 설정과 같아지면 개별 설정을 지워 색 설정을 따르게 한다 */
export function toggleHighlight(settings: BlankSettings, key: string, mainColor: string): BlankSettings {
  const nowBlank = isBlank(settings, key, mainColor);
  const byColor = colorOn(settings, mainColor);
  const excluded = settings.excluded.filter((k) => k !== key);
  const included = (settings.included ?? []).filter((k) => k !== key);
  const wantBlank = !nowBlank;
  if (wantBlank !== byColor) (wantBlank ? included : excluded).push(key);
  return { ...settings, excluded, included };
}

/** 빈칸 색 하나를 켜고 끈다. 처음(전체 켜짐)에서 끄면 나머지 색을 모두 켠 상태로 바꾼다 */
export function toggleColor(settings: BlankSettings, color: string, allColors: string[]): BlankSettings {
  const current = settings.colors ?? allColors;
  const colors = current.includes(color) ? current.filter((c) => c !== color) : [...current, color];
  return { ...settings, colors };
}

/** 색을 한꺼번에 정한다. 개별 설정은 지워 색 설정만 남긴다 */
export function setAllColors(settings: BlankSettings, colors: string[]): BlankSettings {
  return { ...settings, colors, excluded: [], included: [] };
}

export interface ColorStat {
  color: string;
  count: number;
}

/** 문서에 쓰인 대표 색과 하이라이트 수. 많이 쓴 색부터 */
export function colorStats(mainColors: string[]): ColorStat[] {
  const counts = new Map<string, number>();
  for (const c of mainColors) if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.entries()].map(([color, count]) => ({ color, count })).sort((a, b) => b.count - a.count);
}
