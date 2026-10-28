import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { FileSpreadsheet, Link2, LoaderCircle, RefreshCw, Unplug } from 'lucide-react';

type GoogleSheet = {
  properties: { sheetId: number; title: string; index: number };
};

type SpreadsheetInfo = {
  spreadsheetId: string;
  properties?: { title?: string };
  sheets?: GoogleSheet[];
};

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
};

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (options: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';
const READ_ONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

function getSpreadsheetId(value: string): string | null {
  const input = value.trim();
  const match = input.match(/(?:docs\.google\.com\/spreadsheets\/d\/)([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? null;
}

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT}"]`);
    const script = existing ?? document.createElement('script');
    const onLoad = () => window.google?.accounts?.oauth2 ? resolve() : reject(new Error('Google OAuth недоступен в этом браузере.'));
    const onError = () => reject(new Error('Не удалось загрузить авторизацию Google. Проверьте соединение и блокировщики.'));
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    if (!existing) {
      script.src = GOOGLE_SCRIPT;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
}

async function readSpreadsheet(accessToken: string, spreadsheetId: string): Promise<SpreadsheetInfo> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,properties(title),sheets(properties(sheetId,title,index))`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    if (response.status === 401) throw new Error('Доступ Google истёк. Подключите таблицу повторно.');
    if (response.status === 403) throw new Error('У Google-аккаунта нет доступа к этой таблице или API ещё не включён в Google Cloud.');
    if (response.status === 404) throw new Error('Таблица не найдена. Проверьте ссылку и права доступа.');
    throw new Error(`Google Sheets вернул ошибку (${response.status}). Попробуйте ещё раз.`);
  }
  return response.json() as Promise<SpreadsheetInfo>;
}

async function readSheetValues(accessToken: string, spreadsheetId: string, sheetTitle: string): Promise<string[][]> {
  const range = `'${sheetTitle.replace(/'/g, "''")}'!A1:AZ500`;
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    if (response.status === 403) throw new Error('Нет доступа к выбранному листу.');
    throw new Error(`Не удалось прочитать лист (${response.status}).`);
  }
  const result = await response.json() as { values?: unknown[][] };
  return (result.values ?? []).map((row) => row.map((cell) => cell == null ? '' : String(cell)));
}

export default function GoogleSheetsIntegration() {
  const clientId = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [spreadsheet, setSpreadsheet] = useState<SpreadsheetInfo | null>(null);
  const [selectedSheetId, setSelectedSheetId] = useState<number | null>(null);
  const [values, setValues] = useState<string[][]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void api.get<{ connection: { settings?: Record<string, unknown> } | null }>('/api/integrations/google/sheets')
      .then((result) => {
        if (!active || !result.connection?.settings) return;
        const saved = result.connection.settings;
        if (typeof saved.spreadsheetUrl === 'string') setUrl(saved.spreadsheetUrl);
        if (typeof saved.selectedSheetId === 'number') setSelectedSheetId(saved.selectedSheetId);
        setNotice('Настройки таблицы восстановлены из аккаунта STEN. Для чтения данных потребуется авторизация Google.');
      })
      .catch((failure) => {
        if (active) setError(failure instanceof Error ? failure.message : 'Не удалось загрузить настройки интеграции.');
      })
      .finally(() => { if (active) setSettingsLoaded(true); });
    return () => { active = false; };
  }, []);

  const selectedSheet = spreadsheet?.sheets?.find((sheet) => sheet.properties.sheetId === selectedSheetId);
  const spreadsheetId = getSpreadsheetId(url);

  const loadSelectedSheet = async (accessToken: string, info: SpreadsheetInfo, sheetId: number) => {
    const sheet = info.sheets?.find((item) => item.properties.sheetId === sheetId);
    if (!sheet) throw new Error('Лист не найден. Выберите лист ещё раз.');
    const rows = await readSheetValues(accessToken, info.spreadsheetId, sheet.properties.title);
    setSelectedSheetId(sheetId);
    setValues(rows);
    setNotice(rows.length ? `Загружено строк: ${rows.length}. Данные готовы к анализу в STEN AI.` : 'В выбранном листе нет заполненных ячеек в диапазоне A1:AZ500.');
  };

  const connectAndRead = async () => {
    setError('');
    setNotice('');
    if (!clientId) {
      setError('Интеграция пока не настроена: добавьте VITE_GOOGLE_CLIENT_ID после регистрации OAuth-клиента в Google Cloud. Никакие данные не отправлялись.');
      return;
    }
    if (!spreadsheetId) {
      setError('Вставьте корректную ссылку на Google Таблицу.');
      return;
    }

    setBusy(true);
    try {
      await loadGoogleIdentityScript();
      const oauth = window.google?.accounts?.oauth2;
      if (!oauth) throw new Error('Не удалось запустить авторизацию Google.');
      const tokenResponse = await new Promise<{ accessToken: string; expiresIn?: number }>((resolve, reject) => {
        const client = oauth.initTokenClient({
          client_id: clientId,
          scope: READ_ONLY_SCOPE,
          callback: (response) => response.access_token
            ? resolve({ accessToken: response.access_token, expiresIn: response.expires_in ? Number(response.expires_in) : undefined })
            : reject(new Error(response.error_description || response.error || 'Google не выдал доступ.')),
          error_callback: (failure) => reject(new Error(failure.message || 'Окно авторизации Google закрыто или заблокировано.')),
        });
        client.requestAccessToken({ prompt: token ? '' : 'consent' });
      });
      const accessToken = tokenResponse.accessToken;
      const info = await readSpreadsheet(accessToken, spreadsheetId);
      if (!info.sheets?.length) throw new Error('В таблице не найдено доступных листов.');
      setToken(accessToken);
      setSpreadsheet(info);
      setUrl((current) => current.trim());
      const preferredSheetId = info.sheets.some((sheet) => sheet.properties.sheetId === selectedSheetId)
        ? selectedSheetId as number
        : info.sheets[0].properties.sheetId;
      await loadSelectedSheet(accessToken, info, preferredSheetId);
      await api.put('/api/integrations/google/sheets', { accessToken, expiresIn: tokenResponse.expiresIn, settings: {
        spreadsheetUrl: url.trim(),
        spreadsheetId: info.spreadsheetId,
        selectedSheetId: preferredSheetId,
        selectedSheetTitle: info.sheets.find((sheet) => sheet.properties.sheetId === preferredSheetId)?.properties.title || '',
      } });
      setNotice('Настройки таблицы сохранены в аккаунте STEN. ' + (values.length ? '' : 'Данные загружены и готовы к анализу.'));
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось подключить таблицу.');
    } finally {
      setBusy(false);
    }
  };

  const changeSheet = async (rawId: string) => {
    const sheetId = Number(rawId);
    if (!token || !spreadsheet || !Number.isFinite(sheetId)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await loadSelectedSheet(token, spreadsheet, sheetId);
      await api.put('/api/integrations/google/sheets', { accessToken: token, settings: {
        spreadsheetUrl: url.trim(),
        spreadsheetId: spreadsheet.spreadsheetId,
        selectedSheetId: sheetId,
        selectedSheetTitle: spreadsheet.sheets?.find((sheet) => sheet.properties.sheetId === sheetId)?.properties.title || '',
      } });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось прочитать лист.');
      setValues([]);
    } finally {
      setBusy(false);
    }
  };

  const sendToStenAI = () => {
    if (!spreadsheet || !selectedSheet || values.length === 0) return;
    const quote = (value: string) => {
      const normalized = value.replace(/\r?\n/g, ' ').trim();
      return /[",;]/.test(normalized) ? '"' + normalized.replace(/"/g, '""') + '"' : normalized;
    };
    const rows = values.map((row) => row.map(quote).join(';'));
    let tableText = '';
    for (const row of rows) {
      const next = tableText ? tableText + '\n' + row : row;
      if (next.length > 5000) break;
      tableText = next;
    }
    const includedRows = tableText ? tableText.split('\n').length : 0;
    const omittedRows = Math.max(0, values.length - includedRows);
    const context = [
      'ЗАДАЧА: автоматически проанализируй приложенные реальные данные Google Таблицы как управленческий аналитик ресторана. Не проси пользователя повторно отправить таблицу.',
      'Источник: Google Таблицы. Документ: ' + (spreadsheet.properties?.title || 'Без названия') + '. Лист: ' + selectedSheet.properties.title + '.',
      'Не выдумывай отсутствующие значения. Сначала определи заголовки, период, единицы измерения и смысл колонок. Если структуру нельзя надёжно определить — задай уточняющий вопрос. Разделяй факты, расчёты и гипотезы.',
      omittedRows > 0 ? 'Контекст ограничен размером; пропущено строк в конце: ' + omittedRows + '.' : '',
      'ДАННЫЕ ТАБЛИЦЫ (разделитель ;):',
      tableText,
      'Кратко опиши структуру и период таблицы. Рассчитай только показатели, для которых достаточно исходных значений; назови отклонения, возможные причины и следующие проверки. Неизвестные значения обозначь как «нет данных».'
    ].filter(Boolean).join('\n\n').slice(0, 7600);
    try {
      sessionStorage.setItem('sten_google_sheet_context_v1', context);
      window.location.assign('/ai?sheetContext=1');
    } catch {
      setError('Не удалось подготовить данные для STEN AI. Возможно, таблица слишком большая для памяти браузера.');
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await api.delete('/api/integrations/google/sheets');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось отключить интеграцию в аккаунте.');
      setBusy(false);
      return;
    }
    setToken('');
    setSpreadsheet(null);
    setSelectedSheetId(null);
    setValues([]);
    setError('');
    setUrl('');
    setNotice('Настройки таблицы удалены из аккаунта STEN. Токен Google удалён из памяти этой страницы.');
    setBusy(false);
  };

  return (
    <section className="panel" id="settings-integrations">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <FileSpreadsheet size={21} aria-hidden="true" />
        <div>
          <h2 style={{ marginBottom: 4 }}>Google Таблицы</h2>
          <p className="muted" style={{ margin: 0 }}>Подключение только для чтения. Таблица не изменяется. После нажатия «Передать в STEN AI» выбранные данные отправляются в STEN для анализа; передаются только строки в пределах указанного лимита.</p>
        </div>
      </div>

      {!spreadsheet ? (
        <label className="settings-field" style={{ marginTop: 16 }}>
          <span>Ссылка на таблицу</span>
          <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Вставьте ссылку на Google Таблицу" autoComplete="url" spellCheck={false} aria-describedby="google-sheets-help" style={{ width: "100%", minWidth: 0, boxSizing: "border-box", textOverflow: "ellipsis" }} />
          <small className="muted" id="google-sheets-help">Ссылка нужна только для подключения. После загрузки она будет скрыта; STEN покажет название таблицы и позволит передать данные в AI.</small>
        </label>
      ) : (
        <div style={{ marginTop: 14, padding: '12px 14px', border: '1px solid var(--sten-border-subtle, #d7dde2)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{spreadsheet.properties?.title || 'Google Таблица'}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>Подключена · только чтение</div>
          </div>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => { setSpreadsheet(null); setSelectedSheetId(null); setValues([]); setNotice(''); setError(''); }}>Изменить ссылку</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button className="primary-button" type="button" disabled={busy || !settingsLoaded} onClick={() => void connectAndRead()}>
          {busy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : token ? <RefreshCw size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
          {busy ? 'Загружаем…' : token ? 'Обновить данные' : 'Подключить и прочитать'}
        </button>
        {(token || (settingsLoaded && url.trim())) && <button className="secondary-button" type="button" disabled={busy} onClick={() => void disconnect()}><Unplug size={16} /> Отключить</button>}
      </div>

      {error && <div className="pnl-message error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
      {notice && <div className="pnl-message ok" role="status" style={{ marginTop: 12 }}>{notice}</div>}

      {spreadsheet && (
        <div style={{ marginTop: 14 }}>
          <label className="settings-field">
            <span>Лист для анализа</span>
            <select value={selectedSheetId ?? ''} onChange={(event) => void changeSheet(event.target.value)} disabled={busy}>
              {spreadsheet.sheets?.map((sheet) => <option key={sheet.properties.sheetId} value={sheet.properties.sheetId}>{sheet.properties.title}</option>)}
            </select>
          </label>
          {values.length > 0 && (
            <div style={{ marginTop: 12, padding: '14px 16px', borderRadius: 10, background: 'var(--sten-surface-muted, rgba(127, 140, 150, .08))' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}><FileSpreadsheet size={17} aria-hidden="true" /> Данные готовы для STEN AI</div>
              <p className="muted" style={{ margin: '6px 0 12px', fontSize: 13 }}>Загружено {values.length} строк. Предпросмотр таблицы скрыт, чтобы не перегружать настройки.</p>
              <button type="button" className="primary-button" disabled={busy} onClick={sendToStenAI}><FileSpreadsheet size={16} aria-hidden="true" /> Анализировать в STEN AI</button>
              <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>Данные попадут в черновик вопроса и отправятся в STEN AI только после нажатия «Отправить» в чате.</p>
            </div>
          )}
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>Ссылка и выбранный лист сохраняются в аккаунте STEN и восстанавливаются на других устройствах. Доступ к данным Google требует повторной авторизации после окончания действия токена. Без фоновой синхронизации. Отключение очищает токен из памяти STEN, но для полного отзыва разрешения откройте настройки доступа к аккаунту Google.</p>
    </section>
  );
}
