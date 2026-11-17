import { IndexedDbStore } from './indexedDbStore';
import type { StudyStore } from './types';

export type * from './types';

/** 앱 전체에서 쓰는 저장소. 로그인 동기화가 붙으면 여기서 구현을 바꾼다 */
export const store: StudyStore = new IndexedDbStore();
