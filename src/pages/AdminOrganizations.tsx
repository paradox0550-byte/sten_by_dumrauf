import { useCallback, useEffect, useState } from 'react';
import { Building2, Plus, RefreshCw, ShieldCheck, UserRound, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

type Organization = {
  id: string;
  code: string;
  name: string;
  status: 'active' | 'suspended' | 'archived';
  subscription_until: string | null;
  user_count: number;
  created_at: string;
  updated_at: string;
};

export default function AdminOrganizations() {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await api.get<{ organizations: Organization[] }>('/api/admin/organizations');
      setOrganizations(r.organizations || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить организации.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user?.role === 'super_admin') void load(); }, [load, user?.role]);

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.post('/api/admin/organizations', {
        name: name.trim(),
        code: code.trim() || undefined,
        ownerEmail: ownerEmail.trim() || undefined,
      });
      setName('');
      setCode('');
      setOwnerEmail('');
      setShowCreate(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Организацию не удалось создать.');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (org: Organization, status: Organization['status']) => {
    setError('');
    try {
      const r = await api.patch<{ organization: Organization }>(`/api/admin/organizations/${org.id}`, { status });
      setOrganizations(list => list.map(item => item.id === org.id ? { ...item, ...r.organization } : item));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Статус не изменён.');
    }
  };

  const renewMonth = async (org: Organization) => {
    const today = new Date();
    const todayIso = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
    const base = org.subscription_until && org.subscription_until >= todayIso ? org.subscription_until : todayIso;
    const [year, month, day] = base.split('-').map(Number);
    const targetMonth = month;
    const targetYear = year + Math.floor(targetMonth / 12);
    const normalizedMonth = targetMonth % 12;
    const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
    const nextDate = [
      targetYear,
      String(normalizedMonth + 1).padStart(2, '0'),
      String(Math.min(day, lastDay)).padStart(2, '0'),
    ].join('-');

    setRenewingId(org.id);
    setError('');
    try {
      const r = await api.patch<{ organization: Organization }>(`/api/admin/organizations/${org.id}`, {
        subscription_until: nextDate,
      });
      setOrganizations(list => list.map(item => item.id === org.id ? { ...item, ...r.organization } : item));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Срок оплаты не продлён.');
    } finally {
      setRenewingId(null);
    }
  };

  if (user?.role !== 'super_admin') {
    return <div className="page"><section className="panel"><h2>Доступ закрыт</h2><p className="muted">Этот контур доступен только системному администратору STEN.</p></section></div>;
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">SYSTEM ADMINISTRATION</span>
          <h1>Организации</h1>
          <p>Системный контур STEN. Здесь создаются отдельные рабочие двери организаций.</p>
        </div>
        <div className="page-actions">
          <button className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Обновить</button>
          <button className="primary-button" onClick={() => setShowCreate(true)}><Plus size={16} /> Новая организация</button>
        </div>
      </div>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="avatar"><ShieldCheck size={18} /></div>
          <div><b>Super Admin</b><div className="muted">Только Вы управляете организациями и их доступом.</div></div>
        </div>
      </section>

      {error && <div className="pnl-message error" style={{ marginBottom: 16 }}>{error}</div>}

      {showCreate && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><h2 style={{ margin: 0 }}>Создать организацию</h2><p className="muted">UUID создаётся сервером. Код — человекочитаемый ID для входа.</p></div>
            <button className="icon-button" onClick={() => setShowCreate(false)} aria-label="Закрыть"><X size={17} /></button>
          </div>
          <div className="settings-grid" style={{ marginTop: 16 }}>
            <label className="settings-field"><span>Название организации</span><input value={name} onChange={e => setName(e.target.value)} placeholder="Например, Mantera Restaurants" autoFocus /></label>
            <label className="settings-field"><span>ID организации</span><input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Например, ORG-MANTERA" /></label>
            <label className="settings-field"><span>Email владельца <small>необязательно</small></span><input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} placeholder="owner@company.ru" /></label>
          </div>
          <div className="quick-actions">
            <button className="secondary-button" onClick={() => setShowCreate(false)}>Отмена</button>
            <button className="primary-button" disabled={saving || !name.trim()} onClick={() => void create()}>{saving ? 'Создаём…' : 'Создать организацию'}</button>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head"><h2>Рабочие контуры</h2><span className="muted">{organizations.length} организаций</span></div>
        {loading ? <div className="empty-state">Загружаем организации…</div> : organizations.length === 0 ? (
          <div className="empty-state"><Building2 size={22} /><p>Организаций пока нет.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Организация</th><th>ID</th><th>Пользователи</th><th>Оплачено до</th><th>Статус</th><th>Действие</th></tr></thead>
              <tbody>{organizations.map(org => (
                <tr key={org.id}>
                  <td><b>{org.name}</b><small className="muted">{new Date(org.created_at).toLocaleDateString('ru-RU')}</small></td>
                  <td><code>{org.code}</code></td>
                  <td><span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><UserRound size={14} />{org.user_count}</span></td>
                  <td>{org.subscription_until ? new Date(`${org.subscription_until}T00:00:00`).toLocaleDateString('ru-RU') : <span className="muted">Не оплачено</span>}</td>
                  <td><span className={`badge badge--${org.status === 'active' ? 'success' : org.status === 'suspended' ? 'warning' : 'neutral'}`}>{org.status === 'active' ? 'Активна' : org.status === 'suspended' ? 'Приостановлена' : 'В архиве'}</span></td>
                  <td style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="secondary-button" onClick={() => void renewMonth(org)} disabled={renewingId === org.id}>
                      {renewingId === org.id ? 'Продлеваем…' : 'Продлить на месяц'}
                    </button>
                    {org.status === 'active'
                      ? <button className="secondary-button" onClick={() => void setStatus(org, 'suspended')}>Закрыть дверь</button>
                      : org.status === 'suspended'
                        ? <button className="secondary-button" onClick={() => void setStatus(org, 'active')}>Открыть</button>
                        : <span className="muted">Только чтение</span>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
