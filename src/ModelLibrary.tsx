import { useState } from 'react';
import { dimensionText } from './domain';
import type { SavedModel, Unit } from './domain';

export default function ModelLibrary({ models, unit, onOpen, onRename, onChange }: {
  models: SavedModel[];
  unit: Unit;
  onOpen: (model: SavedModel) => void;
  onRename: (id: SavedModel['id'], name: string) => void;
  onChange: (id: SavedModel['id'], field: 'history' | 'preset', enabled: boolean) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  return <section className="model-library" aria-label="내 모델 관리">
    {(['history', 'preset'] as const).map(field => {
      const entries = models.filter(model => model[field]);
      return <section key={field}>
        <h2>{field === 'history' ? '모델 기록' : '내 프리셋'}</h2>
        {!entries.length && <p>{field === 'history' ? '3D로 비교한 모델이 여기에 저장돼요.' : '모델 기록에서 프리셋을 등록할 수 있어요.'}</p>}
        {entries.map(model => <article key={model.id}>
          <strong>{model.name}</strong>
          <small>{dimensionText(model, unit)}</small>
          {editing === `${field}-${model.id}` && <form onSubmit={event => {
            event.preventDefault();
            if (!draft.trim()) return;
            onRename(model.id, draft.trim());
            setEditing(null);
          }}>
            <input aria-label={`${model.name} 새 이름`} maxLength={60} value={draft} onChange={event => setDraft(event.target.value)} />
            <button type="submit">저장</button>
            <button type="button" onClick={() => setEditing(null)}>취소</button>
          </form>}
          <div className="library-actions">
            <button onClick={() => onOpen(model)}>꺼내기</button>
            <button onClick={() => { setEditing(`${field}-${model.id}`); setDraft(model.name); }}>이름 수정</button>
            {field === 'history' && !model.preset && <button onClick={() => onChange(model.id, 'preset', true)}>프리셋 등록</button>}
            <button onClick={() => onChange(model.id, field, false)}>{field === 'history' ? '기록 삭제' : '프리셋 삭제'}</button>
          </div>
        </article>)}
      </section>;
    })}
  </section>;
}
