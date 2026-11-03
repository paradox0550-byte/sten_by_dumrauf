import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Link2, Plus, RefreshCw, ShieldCheck, Unlink } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import './IikoIntegration.css';

type IikoOrganization = { id: string; name: string; restaurant_id: string | null };
type IikoConnection = {
  id: string; label: string; app_id: string; correlation_id: string | null;
  last_verified_at: string; organizations: IikoOrganization[];
};
type Restaurant = { id: string; name: string };
type ConnectionResponse = { connections: IikoConnection[] };
type WorkspaceResponse = { restaurants: Restaurant[] };

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message
    : error instanceof Error ? error.message : 'Не удалось выполнить операцию с iiko.';
}

export default function IikoIntegration() {
  const [connections, setConnections] = useState<IikoConnection[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [label, setLabel] = useState('iiko Cloud');
  const [appId, setAppId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [apiKey, setApiKey] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [integrationData, workspaceData] = await Promise.all([
        api.get<ConnectionResponse>('/api/integrations/iiko'),
        api.get<WorkspaceResponse>('/api/b2b/context'),
      ]);
      setConnections(integrationData.connections || []);
      setRestaurants(workspaceData.restaurants || []);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!appId.trim() || !clientSecret || !apiKey) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.post('/api/integrations/iiko/connect', {
        label: label.trim() || 'iiko Cloud',
        app_id: appId.trim(),
        client_secret: clientSecret,
        api_key: apiKey,
      });
      setAppId('');
      setClientSecret('');
      setApiKey('');
      setNotice('iiko подключена. Выберите соответствие организаций ресторанам STEN.');
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function mapOrganization(connectionId: string, organizationId: string, restaurantId: string) {
    if (!restaurantId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.put('/api/integrations/iiko/' + encodeURIComponent(connectionId) + '/mapping', {
        iiko_organization_id: organizationId,
        restaurant_id: restaurantId,
      });
      setNotice('Связь организации iiko с рестораном STEN сохранена.');
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function disconnect(connection: IikoConnection) {
    if (!window.confirm('Отключить ' + connection.label + '? Сопоставления организаций этого подключения будут удалены.')) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.delete('/api/integrations/iiko/' + encodeURIComponent(connection.id));
      setNotice('Подключение iiko отключено.');
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel iiko-integration" id="settings-integrations" aria-labelledby="iiko-integration-title">
      <div className="iiko-integration__header">
        <div>
          <span className="eyebrow"><Link2 size={12} /> ИНТЕГРАЦИИ</span>
          <h2 id="iiko-integration-title">iiko Cloud</h2>
          <p className="muted">Подключайте независимые организации iiko и связывайте каждую с рестораном в рабочем контуре STEN.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void load()} disabled={loading || saving} aria-label="Обновить подключения">
          <RefreshCw size={15} />
        </button>
      </div>

      {error && <div className="iiko-integration__message is-error" role="alert"><AlertCircle size={15} />{error}</div>}
      {notice && <div className="iiko-integration__message" role="status"><CheckCircle2 size={15} />{notice}</div>}

      <div className="iiko-integration__security">
        <ShieldCheck size={17} />
        <span>Учётные данные передаются на сервер STEN по защищённому соединению и сохраняются в зашифрованном виде. Секреты не отображаются после подключения.</span>
      </div>

      <form className="iiko-integration__form" onSubmit={(event) => void connect(event)}>
        <h3><Plus size={16} /> Добавить подключение</h3>
        <label className="settings-field">
          <span>Название подключения</span>
          <input value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} placeholder="Например, Основная компания" />
        </label>
        <label className="settings-field">
          <span>appId</span>
          <input value={appId} maxLength={200} onChange={(event) => setAppId(event.target.value)} autoComplete="off" required />
        </label>
        <label className="settings-field">
          <span>Client Secret</span>
          <input type="password" value={clientSecret} maxLength={500} onChange={(event) => setClientSecret(event.target.value)} autoComplete="new-password" required />
        </label>
        <label className="settings-field">
          <span>API-ключ iikoWeb</span>
          <input type="password" value={apiKey} maxLength={500} onChange={(event) => setApiKey(event.target.value)} autoComplete="new-password" required />
          <small className="muted">iikoWeb → Интеграции → API-ключи.</small>
        </label>
        <button className="primary-button" type="submit" disabled={saving || !appId.trim() || !clientSecret || !apiKey}>
          {saving ? 'Проверяем доступ…' : 'Проверить и подключить'}
        </button>
      </form>

      <div className="iiko-integration__connections">
        <h3>Подключённые организации</h3>
        {loading ? <p className="muted">Загружаем подключения…</p>
          : connections.length === 0 ? <p className="muted">Подключений пока нет.</p>
            : connections.map((connection) => (
              <article className="iiko-integration__connection" key={connection.id}>
                <div className="iiko-integration__connection-head">
                  <div><strong>{connection.label}</strong><small>appId: {connection.app_id}</small></div>
                  <button className="iiko-integration__disconnect" type="button" onClick={() => void disconnect(connection)} disabled={saving} aria-label={'Отключить ' + connection.label}>
                    <Unlink size={15} /> Отключить
                  </button>
                </div>
                {connection.organizations.map((organization) => (
                  <div className="iiko-integration__organization" key={organization.id}>
                    <div><strong>{organization.name}</strong><small>ID iiko: {organization.id}</small></div>
                    <label className="settings-field">
                      <span>Ресторан STEN</span>
                      <select value={organization.restaurant_id || ''} disabled={saving || restaurants.length === 0}
                        onChange={(event) => void mapOrganization(connection.id, organization.id, event.target.value)}>
                        <option value="">Не сопоставлен</option>
                        {restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}
                      </select>
                    </label>
                    <span className={'iiko-integration__status ' + (organization.restaurant_id ? 'is-mapped' : '')}>
                      {organization.restaurant_id ? 'Связь настроена' : 'Требуется сопоставление'}
                    </span>
                  </div>
                ))}
                <small className="muted">Последняя проверка: {connection.last_verified_at ? new Date(connection.last_verified_at).toLocaleString('ru-RU') : '—'}</small>
              </article>
            ))}
      </div>
      <p className="iiko-integration__footnote">На этом этапе подключается доступ и список организаций. Отчётность и закрытие операционного дня будут включены после проверки официального Reporting API и реальных данных.</p>
    </section>
  );
}
