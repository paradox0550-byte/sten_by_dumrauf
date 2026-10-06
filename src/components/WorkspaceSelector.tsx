import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Building2, GitBranch, Layers3, Users, Plus, Trash2, X, ChevronDown } from 'lucide-react';
import { api } from '../lib/api';
import { DEFAULT_PERIOD, Scope } from '../lib/scope';

type Node = { id: string; name: string; type: 'project' | 'branch' | 'restaurant' | 'department'; parentId?: string };
type Kind = Node['type'];

function flatten(input: unknown, parentId?: string, out: Node[] = []): Node[] {
  if (Array.isArray(input)) { for (const x of input) flatten(x, parentId, out); return out; }
  if (!input || typeof input !== 'object') return out;
  const x = input as Record<string, unknown>;
  const id = typeof x.id === 'string' ? x.id : typeof x.uuid === 'string' ? x.uuid : undefined;
  const name = typeof x.name === 'string' ? x.name : typeof x.title === 'string' ? x.title : undefined;
  const raw = String(x.type || x.kind || '').toLowerCase();
  const type: Kind = raw.includes('branch') ? 'branch'
    : raw.includes('restaurant') || raw.includes('unit') ? 'restaurant'
    : raw.includes('department') ? 'department' : 'project';
  const nextParent = id || parentId;
  if (id && name) out.push({ id, name, type, parentId });
  for (const key of ['tree', 'children', 'projects', 'branches', 'restaurants', 'departments', 'units'])
    if (x[key]) flatten(x[key], nextParent, out);
  return out;
}

const KIND_LABEL: Record<Kind, string> = {
  project: 'Проект', branch: 'Филиал', restaurant: 'Ресторан', department: 'Отдел',
};

function useOrgTree() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reloadSeqRef = useRef(0);

  const reload = async () => {
    const seq = ++reloadSeqRef.current;
    setLoading(true);
    try {
      const x = await api.get<unknown>('/api/b2b/org/tree');
      if (seq !== reloadSeqRef.current) return;
      setNodes(flatten(x));
      setError('');
    } catch (e) {
      if (seq !== reloadSeqRef.current) return;
      setNodes([]);
      setError(e instanceof Error ? e.message : 'Не удалось загрузить дерево');
    } finally {
      if (seq === reloadSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);
  return { nodes, loading, error, reload, setError };
}

export default function WorkspaceSelector({
  value, onChange, variant = 'full',
}: {
  value: Scope; onChange: (next: Scope) => void; variant?: 'full' | 'compact';
}) {
  const { nodes, loading, error, reload, setError } = useOrgTree();
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState<Kind | null>(null);
  const [newName, setNewName] = useState('');
  const [open, setOpen] = useState(false);

  const projects = useMemo(() => nodes.filter(x => x.type === 'project'), [nodes]);
  const branches = useMemo(() => nodes.filter(x => x.type === 'branch' && (!value.projectId || x.parentId === value.projectId)), [nodes, value.projectId]);
  const restaurants = useMemo(() => nodes.filter(x => x.type === 'restaurant' && (!value.branchId || x.parentId === value.branchId)), [nodes, value.branchId]);
  const departments = useMemo(() => nodes.filter(x => x.type === 'department' && (!value.restaurantId || x.parentId === value.restaurantId)), [nodes, value.restaurantId]);

  const set = (patch: Partial<Scope>) => onChange({ ...value, ...patch });

  const parentIdFor = (kind: Kind): string | undefined => {
    if (kind === 'project') return undefined;
    if (kind === 'branch') return value.projectId;
    if (kind === 'restaurant') return value.branchId;
    if (kind === 'department') return value.restaurantId;
    return undefined;
  };

  const openAdd = (kind: Kind) => {
    if (kind !== 'project' && !parentIdFor(kind)) {
      setError('Сначала выберите родительский уровень.');
      return;
    }
    setError('');
    setNewName('');
    setAdding(kind);
  };

  const submitAdd = async () => {
    if (!adding || !newName.trim()) return;
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = { kind: adding, name: newName.trim() };
      const pid = parentIdFor(adding);
      if (pid) body.parent_id = pid;
      const r = await api.post<{ unit: { id: string } }>('/api/b2b/org/units', body);
      const created = (r as any)?.unit ?? (r as any)?.data?.unit;
      await reload();
      if (created && created.id) {
        if (adding === 'project') set({ projectId: created.id, branchId: undefined, restaurantId: undefined, departmentId: undefined });
        else if (adding === 'branch') set({ branchId: created.id, restaurantId: undefined, departmentId: undefined });
        else if (adding === 'restaurant') set({ restaurantId: created.id, departmentId: undefined });
        else if (adding === 'department') set({ departmentId: created.id });
      }
      setAdding(null);
      setNewName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать');
    } finally {
      setSaving(false);
    }
  };

  const removeNode = async (kind: Kind) => {
    const id = kind === 'project' ? value.projectId : kind === 'branch' ? value.branchId : kind === 'restaurant' ? value.restaurantId : value.departmentId;
    if (!id) return;
    const name = nodes.find(n => n.id === id)?.name || kind;
    if (!confirm('Удалить «' + name + '»?')) return;
    setSaving(true);
    setError('');
    try {
      await api.delete('/api/b2b/org/units/' + id);
      if (kind === 'project') set({ projectId: undefined, branchId: undefined, restaurantId: undefined, departmentId: undefined });
      else if (kind === 'branch') set({ branchId: undefined, restaurantId: undefined, departmentId: undefined });
      else if (kind === 'restaurant') set({ restaurantId: undefined, departmentId: undefined });
      else if (kind === 'department') set({ departmentId: undefined });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить');
    } finally {
      setSaving(false);
    }
  };

  const SelectFull = ({ label, items, selected, onSelect, Icon, kind }: {
    label: string; items: Node[]; selected: string | undefined;
    onSelect: (id: string | undefined) => void; Icon: typeof Building2; kind: Kind;
  }) => (
    <label className="settings-field workspace-select">
      <span><Icon size={15} />{label}</span>
      <div className="workspace-row">
        <select value={selected || ''} onChange={e => onSelect(e.target.value || undefined)} disabled={loading || items.length === 0}>
          <option value="">{items.length ? 'Не выбрано' : 'Нет данных'}</option>
          {items.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <button type="button" className="icon-button compact" title={'Создать: ' + label} onClick={() => openAdd(kind)} disabled={loading || saving}>
          <Plus size={14} />
        </button>
        <button type="button" className="icon-button compact" title={'Удалить: ' + label} onClick={() => void removeNode(kind)} disabled={!selected || loading || saving}>
          <Trash2 size={14} />
        </button>
      </div>
    </label>
  );

  const modal = adding ? (
    <div className="modal-backdrop" onMouseDown={e => e.currentTarget === e.target && setAdding(null)}>
      <section className="modal-card">
        <button className="modal-close" onClick={() => setAdding(null)} aria-label="Закрыть"><X size={18} /></button>
        <small>СОЗДАТЬ · {KIND_LABEL[adding].toUpperCase()}</small>
        <h2>Новый {KIND_LABEL[adding].toLowerCase()}</h2>
        <label className="settings-field">
          <span>Название</span>
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void submitAdd(); if (e.key === 'Escape') setAdding(null); }}
            placeholder="Введите название" />
        </label>
        <div className="quick-actions">
          <button className="secondary-button" onClick={() => setAdding(null)}>Отмена</button>
          <button className="primary-button" disabled={!newName.trim() || saving} onClick={() => void submitAdd()}>
            {saving ? 'Сохраняем…' : 'Создать'}
          </button>
        </div>
      </section>
    </div>
  ) : null;

  if (variant === 'compact') {
    const activeProject = projects.find(x => x.id === value.projectId);
    const activeBranch = branches.find(x => x.id === value.branchId);
    const activeRestaurant = restaurants.find(x => x.id === value.restaurantId);
    const activeDepartment = departments.find(x => x.id === value.departmentId);
    const parts = [activeProject && activeProject.name, activeBranch && activeBranch.name, activeRestaurant && activeRestaurant.name, activeDepartment && activeDepartment.name].filter(Boolean) as string[];
    const shortLabel = parts.length ? parts[parts.length - 1] : 'Контур';
    const fullLabel = parts.length ? parts.join(' · ') : 'Рабочий контур';

    return (
      <>
        <button className="workspace-btn" onClick={() => setOpen(v => !v)} title={fullLabel}>
          <Layers3 size={15} />
          <span className="workspace-btn-label">{shortLabel}</span>
          <ChevronDown size={13} />
        </button>
        {open && (
          <>
            <button className="workspace-popover-backdrop" aria-label="Закрыть" onClick={() => setOpen(false)} />
            <div className="workspace-popover">
              <div className="workspace-popover-head">
                <b>Рабочий контур</b>
                <button className="icon-button compact" onClick={() => setOpen(false)} aria-label="Закрыть"><X size={14} /></button>
              </div>
              <label className="settings-field">
                <span>Период</span>
                <input type="month" value={value.period || DEFAULT_PERIOD} onChange={e => set({ period: e.target.value })} />
              </label>
              <label className="settings-field workspace-select">
                <span><Layers3 size={14} />Проект</span>
                <div className="workspace-row">
                  <select value={value.projectId || ''} onChange={e => set({ projectId: e.target.value || undefined, branchId: undefined, restaurantId: undefined, departmentId: undefined })} disabled={loading || projects.length === 0}>
                    <option value="">{projects.length ? 'Не выбрано' : 'Нет данных'}</option>
                    {projects.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <button type="button" className="icon-button compact" title="Создать" onClick={() => openAdd('project')} disabled={loading || saving}><Plus size={13} /></button>
                  <button type="button" className="icon-button compact" title="Удалить" onClick={() => void removeNode('project')} disabled={!value.projectId || loading || saving}><Trash2 size={13} /></button>
                </div>
              </label>
              <label className="settings-field workspace-select">
                <span><GitBranch size={14} />Филиал</span>
                <div className="workspace-row">
                  <select value={value.branchId || ''} onChange={e => set({ branchId: e.target.value || undefined, restaurantId: undefined, departmentId: undefined })} disabled={loading || branches.length === 0}>
                    <option value="">{branches.length ? 'Не выбрано' : 'Нет данных'}</option>
                    {branches.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <button type="button" className="icon-button compact" title="Создать" onClick={() => openAdd('branch')} disabled={loading || saving}><Plus size={13} /></button>
                  <button type="button" className="icon-button compact" title="Удалить" onClick={() => void removeNode('branch')} disabled={!value.branchId || loading || saving}><Trash2 size={13} /></button>
                </div>
              </label>
              <label className="settings-field workspace-select">
                <span><Building2 size={14} />Ресторан</span>
                <div className="workspace-row">
                  <select value={value.restaurantId || ''} onChange={e => set({ restaurantId: e.target.value || undefined, departmentId: undefined })} disabled={loading || restaurants.length === 0}>
                    <option value="">{restaurants.length ? 'Не выбрано' : 'Нет данных'}</option>
                    {restaurants.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <button type="button" className="icon-button compact" title="Создать" onClick={() => openAdd('restaurant')} disabled={loading || saving}><Plus size={13} /></button>
                  <button type="button" className="icon-button compact" title="Удалить" onClick={() => void removeNode('restaurant')} disabled={!value.restaurantId || loading || saving}><Trash2 size={13} /></button>
                </div>
              </label>
              <label className="settings-field workspace-select">
                <span><Users size={14} />Отдел</span>
                <div className="workspace-row">
                  <select value={value.departmentId || ''} onChange={e => set({ departmentId: e.target.value || undefined })} disabled={loading || departments.length === 0}>
                    <option value="">{departments.length ? 'Не выбрано' : 'Нет данных'}</option>
                    {departments.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <button type="button" className="icon-button compact" title="Создать" onClick={() => openAdd('department')} disabled={loading || saving}><Plus size={13} /></button>
                  <button type="button" className="icon-button compact" title="Удалить" onClick={() => void removeNode('department')} disabled={!value.departmentId || loading || saving}><Trash2 size={13} /></button>
                </div>
              </label>
              {error && <div className="pnl-message warn">{error}</div>}
            </div>
          </>
        )}
        {modal}
      </>
    );
  }

  return (
    <section className="panel workspace-settings">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">РАБОЧИЙ КОНТУР</span>
          <h2>Где сейчас работаем</h2>
          <p className="muted">Выбор сохраняется автоматически. Создание и удаление узлов контура — здесь же.</p>
        </div>
        <div className="workspace-status"><Check size={15} />Единый контекст</div>
      </div>
      <div className="workspace-grid">
        <label className="settings-field workspace-select">
          <span><Layers3 size={15} />Период</span>
          <div className="workspace-row">
            <input type="month" value={value.period || DEFAULT_PERIOD} onChange={e => set({ period: e.target.value })} />
          </div>
        </label>
        <SelectFull label="Проект" kind="project" items={projects} selected={value.projectId}
          onSelect={id => set({ projectId: id, branchId: undefined, restaurantId: undefined, departmentId: undefined })} Icon={Layers3} />
        <SelectFull label="Филиал" kind="branch" items={branches} selected={value.branchId}
          onSelect={id => set({ branchId: id, restaurantId: undefined, departmentId: undefined })} Icon={GitBranch} />
        <SelectFull label="Ресторан" kind="restaurant" items={restaurants} selected={value.restaurantId}
          onSelect={id => set({ restaurantId: id, departmentId: undefined })} Icon={Building2} />
        <SelectFull label="Отдел" kind="department" items={departments} selected={value.departmentId}
          onSelect={id => set({ departmentId: id })} Icon={Users} />
      </div>
      {error && <div className="pnl-message warn">{error}</div>}
      {!loading && nodes.length === 0 && !error && (
        <div className="pnl-message warn">Рабочих объектов пока нет. Нажмите «+» рядом с «Проект», чтобы создать первый.</div>
      )}
      {modal}
    </section>
  );
}