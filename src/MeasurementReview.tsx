import { useState } from 'react';
import { AXES } from './domain';
import { measurementSourceLabel, unassignedMeasurements } from './imageDimensions';
import type { Axis, Measurement } from './imageDimensions';

const axisNames = { width: '가로', depth: '깊이', height: '높이' };

export default function MeasurementReview({ measurements, onApply, fromSpec }: {
  measurements: Measurement[];
  onApply: (measurements: Measurement[]) => void;
  fromSpec: boolean;
}) {
  const [assigned, setAssigned] = useState<Partial<Record<string, Axis>>>({});
  const unresolved = unassignedMeasurements(measurements);
  const hasOverallSpec = measurements.some(item => item.sourceId !== 'photo' && item.scope === 'overall');
  const hasMappedSpec = measurements.some(item => item.sourceId !== 'photo' && item.scope === 'overall' && item.axis !== null);
  const specCanCrossCheck = measurements.some(item => item.sourceId !== 'photo' && item.scope === 'overall' &&
    item.axis === null && !unresolved.some(value => value.id === item.id));
  if (!fromSpec && !unresolved.length) return null;

  return <div className="measurement-review">
    {unresolved.length > 0 && <p>축이 표시되지 않은 값은 가로·깊이·높이를 지정해 주세요.</p>}
    {unresolved.map(item => <label key={item.id}>
      <span>{item.quote} · {measurementSourceLabel(item)}{item.location && ` · ${item.location}`}</span>
      <select value={assigned[item.id] ?? ''} onChange={event => {
        const axis = AXES.find(value => value === event.target.value);
        setAssigned(current => ({ ...current, [item.id]: axis }));
      }}>
        <option value="">축 선택</option>
        {AXES.map(axis => <option key={axis} value={axis}>{axisNames[axis]}</option>)}
      </select>
    </label>)}
    {fromSpec && !hasOverallSpec &&
      <p>이 항목에서 상품 전체 치수를 찾지 못했어요.</p>}
    <button type="button" disabled={(fromSpec && !hasOverallSpec) || (!hasMappedSpec && !specCanCrossCheck && !Object.values(assigned).some(Boolean))} onClick={() => {
      onApply(measurements.map(item => ({ ...item, axis: assigned[item.id] ?? item.axis })));
    }}>{fromSpec ? '선택한 사양 적용' : '지정한 치수 적용'}</button>
  </div>;
}
