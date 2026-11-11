import type { Dimensions } from './domain';

export type Reading = { mm: number | null; evidence: string; needsReview: boolean };
export type ImageDimensions = Record<keyof Dimensions, Reading>;
export type SizeCandidate = { label: string; dimensions: ImageDimensions };

export const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];
export const imageSizeLimit = 8 * 1024 * 1024;

export const exampleDimensions: ImageDimensions = {
  width: { mm: 130, evidence: '아래쪽 전체 가로 치수선', needsReview: false },
  height: { mm: 35, evidence: '오른쪽 세로 치수선이 전체 높이인지 확인해 주세요.', needsReview: true },
  depth: { mm: null, evidence: '이 각도에서 깊이 표기를 찾을 수 없어요.', needsReview: true },
};
