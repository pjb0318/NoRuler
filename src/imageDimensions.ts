import { AXES } from './domain.ts';
import type { Dimensions } from './domain.ts';

export type Reading = { mm: number | null; evidence: string; needsReview: boolean };
export type ImageDimensions = Record<keyof Dimensions, Reading>;
export const deskParts = ['tabletop', 'fourSquareLegs', 'sideStretchers', 'rearCrossBrace'] as const;
const shapeParts = [...deskParts, 'other'] as const;
type ShapePart = typeof shapeParts[number];
export type ShapeEvidence = {
  readiness: 'ready' | 'needs_view';
  kind: 'cross-braced-desk' | 'other';
  region: { left: number; top: number; right: number; bottom: number } | null;
  view: string;
  parts: ShapePart[];
  unseen: string;
  nextView: string;
};
export type ImageSubject = { id: string; label: string; shapeEvidence: ShapeEvidence | null };
export type SizeCandidate = {
  id?: string;
  subjectId?: string;
  label: string;
  dimensions: ImageDimensions;
  clearance?: Reading;
};
export type ImageAnalysis = {
  subjectStatus: 'identified' | 'needs_selection' | 'not_found';
  subjects: ImageSubject[];
  candidates: SizeCandidate[];
};

export function supportsDesk(shape: ShapeEvidence | null | undefined) {
  return shape?.readiness === 'ready' && shape.kind === 'cross-braced-desk' &&
    deskParts.every(part => shape.parts.includes(part));
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const cleanText = (value: unknown, limit = 180) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

function readMeasurement(value: unknown): Reading {
  const { mm, evidence: rawEvidence, needsReview } = record(value);
  const evidence = cleanText(rawEvidence);
  if (typeof mm !== 'number' || !Number.isFinite(mm) || mm < .1 || mm > 10000 || !evidence) {
    return { mm: null, evidence, needsReview: true };
  }
  return { mm, evidence, needsReview: needsReview !== false };
}

function readShape(value: unknown): ShapeEvidence | null {
  const { readiness, kind, region, view, parts, unseen, nextView } = record(value);
  if (readiness !== 'ready' && readiness !== 'needs_view') return null;
  const { left, top, right, bottom } = record(region);
  const bounds = typeof left === 'number' && typeof top === 'number' && typeof right === 'number' &&
    typeof bottom === 'number' && 0 <= left && left < right && right <= 1 &&
    0 <= top && top < bottom && bottom <= 1 ? { left, top, right, bottom } : null;
  return {
    readiness, kind: kind === 'cross-braced-desk' ? kind : 'other', region: bounds,
    view: cleanText(view), parts: Array.isArray(parts) ? shapeParts.filter(part => parts.includes(part)) : [],
    unseen: cleanText(unseen), nextView: cleanText(nextView),
  };
}

export function normalizeImageAnalysis(value: unknown): ImageAnalysis {
  const payload = record(value);
  if (!Array.isArray(payload.subjects)) throw new Error('Invalid model response');
  const subjects: ImageSubject[] = [];
  const candidates: SizeCandidate[] = [];
  for (const raw of payload.subjects.slice(0, 8)) {
    const subject = record(raw);
    if (!Object.keys(subject).length) continue;
    const subjectId = `subject-${subjects.length + 1}`;
    const label = cleanText(subject.label, 60) || `상품 ${subjects.length + 1}`;
    subjects.push({ id: subjectId, label, shapeEvidence: readShape(subject.shapeEvidence) });
    const options = Array.isArray(subject.options) && subject.options.length ? subject.options.slice(0, 20) : [{}];
    options.forEach((rawOption, index) => {
      const option = record(rawOption);
      const readings = record(option.dimensions);
      candidates.push({
        id: `${subjectId}-option-${index + 1}`, subjectId,
        label: cleanText(option.label, 80) || (options.length === 1 ? label : `크기 ${index + 1}`),
        dimensions: Object.fromEntries(AXES.map(axis => [axis, readMeasurement(readings[axis])])) as ImageDimensions,
        clearance: readMeasurement(option.clearance),
      });
    });
  }
  const subjectStatus = subjects.length > 1 ? 'needs_selection' : subjects.length === 1 ? 'identified' : 'not_found';
  return { subjectStatus, subjects, candidates };
}

export const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];
export const imageSizeLimit = 8 * 1024 * 1024;

export const exampleDimensions: ImageDimensions = {
  width: { mm: 130, evidence: '아래쪽 전체 가로 치수선', needsReview: false },
  height: { mm: 35, evidence: '오른쪽 세로 치수선이 전체 높이인지 확인해 주세요.', needsReview: true },
  depth: { mm: null, evidence: '이 각도에서 깊이 표기를 찾을 수 없어요.', needsReview: true },
};
