import { useState } from 'react';
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
  const range = `'${sheetTitle.replace(/'/g, "''")}'!A1:Z50`;
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

  const selectedSheet = spreadsheet?.sheets?.find((sheet) => sheet.properties.sheetId === selectedSheetId);
  const spreadsheetId = getSpreadsheetId(url);

  const loadSelectedSheet = async (accessToken: string, info: SpreadsheetInfo, sheetId: number) => {
    const sheet = info.sheets?.find((item) => item.properties.sheetId === sheetId);
    if (!sheet) throw new Error('Лист не найден. Выберите лист ещё раз.');
    const rows = await readSheetValues(accessToken, info.spreadsheetId, sheet.properties.title);
    setSelectedSheetId(sheetId);
    setValues(rows);
    setNotice(rows.length ? `Загружено строк: ${rows.length}. Показаны первые 50 строк и 26 столбцов.` : 'В выбранном листе нет заполненных ячеек в диапазоне A1:Z50.');
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
      const accessToken = await new Promise<string>((resolve, reject) => {
        const client = oauth.initTokenClient({
          client_id: clientId,
          scope: READ_ONLY_SCOPE,
          callback: (response) => response.access_token
            ? resolve(response.access_token)
            : reject(new Error(response.error_description || response.error || 'Google не выдал доступ.')),
          error_callback: (failure) => reject(new Error(failure.message || 'Окно авторизации Google закрыто или заблокировано.')),
        });
        client.requestAccessToken({ prompt: token ? '' : 'consent' });
      });
      const info = await readSpreadsheet(accessToken, spreadsheetId);
      if (!info.sheets?.length) throw new Error('В таблице не найдено доступных листов.');
      setToken(accessToken);
      setSpreadsheet(info);
      setUrl((current) => current.trim());
      await loadSelectedSheet(accessToken, info, info.sheets[0].properties.sheetId);
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
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось прочитать лист.');
      setValues([]);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    setToken('');
    setSpreadsheet(null);
    setSelectedSheetId(null);
    setValues([]);
    setError('');
    setNotice('Подключение отключено. Токен удалён из памяти этой страницы.');
  };

  return (
    <section className="panel" id="settings-integrations">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <FileSpreadsheet size={21} aria-hidden="true" />
        <div>
          <h2 style={{ marginBottom: 4 }}>Google Таблицы</h2>
          <p className="muted" style={{ margin: 0 }}>Подключение для чтения. Данные не записываются и не передаются в API STEN.</p>
        </div>
      </div>

      <label className="settings-field" style={{ marginTop: 16 }}>
        <span>Ссылка на таблицу</span>
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/…"
          autoComplete="url"
          spellCheck={false}
          aria-describedby="google-sheets-help"
        />
        <small className="muted" id="google-sheets-help">Откройте таблицу в Google и скопируйте ссылку. У вашего аккаунта должен быть доступ к ней.</small>
      </label>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button className="primary-button" type="button" disabled={busy} onClick={() => void connectAndRead()}>
          {busy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : token ? <RefreshCw size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
          {busy ? 'Загружаем…' : token ? 'Обновить данные' : 'Подключить и прочитать'}
        </button>
        {token && <button className="secondary-button" type="button" disabled={busy} onClick={disconnect}><Unplug size={16} /> Отключить</button>}
      </div>

      {error && <div className="pnl-message error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
      {notice && <div className="pnl-message ok" role="status" style={{ marginTop: 12 }}>{notice}</div>}

      {spreadsheet && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600 }}>{spreadsheet.properties?.title || 'Google Таблица'}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>Режим: только чтение · Токен действует только в памяти текущей страницы</div>
          <label className="settings-field">
            <span>Лист</span>
            <select value={selectedSheetId ?? ''} onChange={(event) => void changeSheet(event.target.value)} disabled={busy}>
              {spreadsheet.sheets?.map((sheet) => <option key={sheet.properties.sheetId} value={sheet.properties.sheetId}>{sheet.properties.title}</option>)}
            </select>
          </label>
          {values.length > 0 && (
            <div style={{ overflowX: 'auto', maxWidth: '100%', border: '1px solid var(--sten-border-subtle, #d7dde2)', borderRadius: 8 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                <tbody>
                  {values.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => {
                        const Tag = rowIndex === 0 ? 'th' : 'td';
                        return <Tag key={cellIndex} style={{ padding: '8px 10px', textAlign: 'left', verticalAlign: 'top', borderBottom: '1px solid var(--sten-border-subtle, #d7dde2)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: 280 }}>{cell || '—'}</Tag>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>Без фоновой синхронизации. Отключение очищает токен из памяти STEN, но для полного отзыва разрешения откройте настройки доступа к аккаунту Google.</p>
    </section>
  );
}
