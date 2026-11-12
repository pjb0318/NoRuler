import { AXES } from './domain.ts';
import type { Dimensions } from './domain.ts';

export type Axis = keyof Dimensions;
export type Measurement = {
  id: string;
  sourceId: string;
  axis: Axis | null;
  mm: number;
  quote: string;
  location: string;
  scope: 'overall' | 'clearance' | 'package' | 'part';
};
export type SpecRow = { id: string; label: string; modelCode: string; optionCode: string; measurements: Measurement[] };
export type Reading = { mm: number | null; evidence: string; needsReview: boolean; measurements?: Measurement[] };
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
export type ImageSubject = { id: string; label: string; modelCode?: string; shapeEvidence: ShapeEvidence | null };
export type SizeCandidate = {
  id?: string;
  subjectId?: string;
  label: string;
  dimensions: ImageDimensions;
  clearance?: Reading;
  optionCode?: string;
  measurements?: Measurement[];
};
export type ImageAnalysis = {
  subjectStatus: 'identified' | 'needs_selection' | 'not_found';
  subjects: ImageSubject[];
  candidates: SizeCandidate[];
  specRows?: SpecRow[];
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

export const sourceLabels: Record<string, string> = {
  photo: '상품 사진', 'spec-image': '사양표 캡처', 'spec-text': '입력한 사양',
};
export const specTextLimit = 4000;
export const measurementSourceLabel = (measurement: Measurement) => sourceLabels[measurement.sourceId] ?? '치수 자료';

const axisLabels = {
  width: /가로|너비|폭|\b(?:width|w)\b/i,
  depth: /깊이|앞뒤|\b(?:depth|d)\b/i,
  height: /높이|세로|\b(?:height|h)\b/i,
};
const numericTriple = /\d+(?:[.,]\d+)?\s*(?:mm|cm|m)?\s*[x×*]\s*\d+(?:[.,]\d+)?\s*(?:mm|cm|m)?\s*[x×*]\s*\d/i;

function readMeasurements(value: unknown, sourceIds: string[], prefix: string, fromTable = false): Measurement[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 24).flatMap((item, index) => {
    const { sourceId, axis, mm, quote: rawQuote, location: rawLocation, scope, basis } = record(item);
    const quote = cleanText(rawQuote);
    const location = cleanText(rawLocation);
    if (typeof sourceId !== 'string' || !sourceIds.includes(sourceId) || !quote ||
        typeof mm !== 'number' || !Number.isFinite(mm) || mm < .1 || mm > 10000 ||
        (scope !== 'overall' && scope !== 'clearance' && scope !== 'package' && scope !== 'part')) return [];
    const claimedAxis = AXES.find(key => key === axis);
    const text = `${quote} ${location}`;
    const diagram = !fromTable && sourceId !== 'spec-text' && basis === 'dimension_line' && !numericTriple.test(text);
    const axisSupported = claimedAxis && (diagram || axisLabels[claimedAxis].test(text));
    return [{
      id: `${prefix}-${index + 1}`, sourceId, mm, quote, location, scope,
      axis: axisSupported ? claimedAxis : null,
    }];
  });
}

function corroborateUnlabeled(measurements: Measurement[]): Measurement[] {
  const explicit = AXES.map(axis => {
    const values = [...new Set(measurements.filter(item => item.scope === 'overall' && item.axis === axis).map(item => item.mm))];
    return values.length === 1 ? values[0] : null;
  });
  if (explicit.includes(null) || new Set(explicit).size !== AXES.length) return measurements;
  const unlabeled = measurements.filter(item => item.scope === 'overall' && item.axis === null);
  if (unlabeled.length !== AXES.length || new Set(unlabeled.map(item => item.mm)).size !== AXES.length ||
      !unlabeled.every(item => explicit.includes(item.mm))) return measurements;
  return measurements.map(item => unlabeled.includes(item) ? { ...item, axis: AXES[explicit.indexOf(item.mm)] } : item);
}

export function reconcileMeasurements(base: ImageDimensions, measurements: Measurement[]): ImageDimensions {
  const resolved = corroborateUnlabeled(measurements);
  return Object.fromEntries(AXES.map(axis => {
    const evidence = resolved.filter(item => item.axis === axis && item.scope === 'overall');
    if (!evidence.length) return [axis, base[axis]];
    const previous = base[axis];
    if (previous.mm !== null && !evidence.some(item => item.mm === previous.mm)) {
      evidence.unshift({ id: `photo-${axis}`, sourceId: 'photo', axis, mm: previous.mm,
        quote: previous.evidence, location: '', scope: 'overall' });
    }
    const values = [...new Set(evidence.map(item => item.mm))];
    const mm = values.length === 1 ? values[0] : null;
    return [axis, { mm, evidence: '', needsReview: mm === null || (base[axis].mm === mm && base[axis].needsReview), measurements: evidence }];
  })) as ImageDimensions;
}

export function unassignedMeasurements(measurements: Measurement[]) {
  return corroborateUnlabeled(measurements).filter(item => item.scope === 'overall' && item.axis === null);
}

export function suggestedSpecRow(rows: SpecRow[], subject?: ImageSubject, option?: SizeCandidate) {
  const model = subject?.modelCode?.trim().toLowerCase();
  const code = option?.optionCode?.trim().toLowerCase();
  const productLabel = subject?.label.trim().toLowerCase();
  const matches = rows.filter(row => {
    const rowModel = row.modelCode.toLowerCase();
    const rowCode = row.optionCode.toLowerCase();
    const sameProduct = model && rowModel ? model === rowModel : !!productLabel && productLabel === row.label.toLowerCase();
    return sameProduct && (code ? code === rowCode : !!model && model === rowModel && !rowCode);
  });
  return matches.length === 1 ? matches[0].id : undefined;
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

export function normalizeImageAnalysis(value: unknown, sourceIds = ['photo']): ImageAnalysis {
  const payload = record(value);
  if (!Array.isArray(payload.subjects)) throw new Error('Invalid model response');
  const subjects: ImageSubject[] = [];
  const candidates: SizeCandidate[] = [];
  for (const raw of payload.subjects.slice(0, 8)) {
    const subject = record(raw);
    if (!Object.keys(subject).length) continue;
    const subjectId = `subject-${subjects.length + 1}`;
    const label = cleanText(subject.label, 60) || `상품 ${subjects.length + 1}`;
    subjects.push({ id: subjectId, label, modelCode: cleanText(subject.modelCode, 80), shapeEvidence: readShape(subject.shapeEvidence) });
    const options = Array.isArray(subject.options) && subject.options.length ? subject.options.slice(0, 20) : [{}];
    options.forEach((rawOption, index) => {
      const option = record(rawOption);
      const readings = record(option.dimensions);
      const photoSource = sourceIds.filter(id => id === 'photo');
      const measurements = [
        ...readMeasurements(option.measurements, photoSource, `${subjectId}-photo-${index + 1}`),
        ...readMeasurements(option.embeddedSpecs, photoSource, `${subjectId}-table-${index + 1}`, true),
      ];
      const dimensions = Object.fromEntries(AXES.map(axis => {
        const reading = readMeasurement(readings[axis]);
        const supported = measurements.some(item => item.scope === 'overall' && item.axis === axis && item.mm === reading.mm);
        return [axis, Array.isArray(option.measurements) && !supported ? { ...reading, mm: null, needsReview: true } : reading];
      })) as ImageDimensions;
      candidates.push({
        id: `${subjectId}-option-${index + 1}`, subjectId,
        label: cleanText(option.label, 80) || (options.length === 1 ? label : `크기 ${index + 1}`),
        optionCode: cleanText(option.optionCode, 80), measurements,
        dimensions: reconcileMeasurements(dimensions, measurements),
        clearance: readMeasurement(option.clearance),
      });
    });
  }
  const subjectStatus = subjects.length > 1 ? 'needs_selection' : subjects.length === 1 ? 'identified' : 'not_found';
  const rawRows = Array.isArray(payload.specRows) ? payload.specRows.slice(0, 20) : [];
  const specRows: SpecRow[] = rawRows.flatMap((raw, index) => {
    const row = record(raw);
    const id = `spec-row-${index + 1}`;
    const measurements = readMeasurements(row.measurements, sourceIds.filter(source => source !== 'photo'), id);
    return measurements.length ? [{
      id, label: cleanText(row.label, 120) || `사양표 항목 ${index + 1}`,
      modelCode: cleanText(row.modelCode, 80), optionCode: cleanText(row.optionCode, 80), measurements,
    }] : [];
  });
  return { subjectStatus, subjects, candidates, specRows };
}

export const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];
export const imageSizeLimit = 8 * 1024 * 1024;

export const exampleDimensions: ImageDimensions = {
  width: { mm: 130, evidence: '아래쪽 전체 가로 치수선', needsReview: false },
  height: { mm: 35, evidence: '오른쪽 세로 치수선이 전체 높이인지 확인해 주세요.', needsReview: true },
  depth: { mm: null, evidence: '이 각도에서 깊이 표기를 찾을 수 없어요.', needsReview: true },
};
