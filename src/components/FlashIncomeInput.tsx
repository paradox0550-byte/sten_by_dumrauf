import { useRef, useState } from 'react';
import { Check, LoaderCircle, Pencil } from 'lucide-react';
import { ApiError, api } from '../lib/api';
import type { IngestConfirmPayload, IngestMessageResponse, ParsedMessage } from '../lib/contracts/ingest';
import type { Scope } from '../lib/scope';

interface Restaurant {
  id: string;
  name: string;
}

interface Props {
  period: string;
  scope: Scope;
  onSaved: () => void;
}

function extractRestaurants(value: unknown): Restaurant[] {
  const raw = (value as { restaurants?: unknown; context?: { restaurants?: unknown } } | null)?.restaurants
    ?? (value as { context?: { restaurants?: unknown } } | null)?.context?.restaurants;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is Restaurant => {
    const x = item as Record<string, unknown>;
    return typeof x?.id === 'string' && typeof x?.name === 'string';
  });
}

function money(value: number | null) {
  return value === null
    ? '—'
    : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value) + ' ₽';
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === 'webhook_secret_not_configured' || error.status === 503) {
      return 'Приём сообщений не настроен. Обратитесь к администратору.';
    }
    if (error.code === 'RESTAURANT_CONTEXT_REQUIRED' || error.status === 422) {
      return 'Выберите ресторан для сохранения сообщения.';
    }
    if (error.status === 502) {
      return 'Не удалось распознать сообщение. Попробуйте ещё раз.';
    }
    return error.message ? 'Ошибка: ' + error.message : 'Не удалось выполнить операцию.';
  }
  return error instanceof Error ? error.message : 'Не удалось выполнить операцию.';
}

export default function FlashIncomeInput({ period, scope, onSaved }: Props) {
  const [text, setText] = useState('');
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [parsed, setParsed] = useState<ParsedMessage | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedRestaurant, setSelectedRestaurant] = useState(scope.restaurantId ?? '');
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const effectiveDate = parsed?.date ?? selectedDate;
  const needsDate = !effectiveDate;
  const needsRestaurant = !scope.restaurantId && !selectedRestaurant;

  const clear = () => {
    setText('');
    setParsed(null);
    setSelectedDate('');
    setSelectedRestaurant(scope.restaurantId ?? '');
    setRestaurants([]);
    setError(null);
    setToast(null);
  };

  const parse = async () => {
    const value = text.trim();
    if (!value) return;
    setIsLoading(true);
    setError(null);
    setToast(null);
    try {
      const response = await api.post<IngestMessageResponse>('/api/ingest/message', { text: value, source: 'manual' });
      setParsed(response.parsed);
      setSelectedDate(response.parsed.date ?? '');
      if (response.context?.restaurant_id) {
        setSelectedRestaurant(response.context.restaurant_id);
      }
      if (!response.parsed.date) setSelectedDate('');
      if (!scope.restaurantId) {
        const context = await api.get<unknown>('/api/b2b/context');
        const available = extractRestaurants(context);
        setRestaurants(available);
        if (!response.context?.restaurant_id && response.parsed.restaurant) {
          const match = available.find(item => item.name.toLowerCase() === response.parsed.restaurant?.toLowerCase());
          if (match) setSelectedRestaurant(match.id);
        }
      }
    } catch (e) {
      const message = errorMessage(e);
      setError(message);
      setToast(message);
    } finally {
      setIsLoading(false);
    }
  };

  const confirm = async () => {
    if (!parsed || !effectiveDate || (!scope.restaurantId && !selectedRestaurant)) return;
    setIsConfirming(true);
    setError(null);
    setToast(null);
    try {
      const payload: IngestConfirmPayload = {
        date: effectiveDate,
        parsed,
        scope: {
          project_id: scope.projectId ?? null,
          branch_id: scope.branchId ?? null,
          restaurant_id: selectedRestaurant || scope.restaurantId || null,
          department_id: scope.departmentId ?? null,
        },
      };
      await api.post('/api/ingest/message/confirm', payload);
      setToast('Сохранено');
      onSaved();
      window.setTimeout(clear, 500);
    } catch (e) {
      const message = errorMessage(e);
      setError(message);
      setToast(message);
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <section className="flash-income-input" aria-label="Ввод доходов через сообщение">
      <div className="flash-income-input__head">
        <div>
          <strong>Доходы за день</strong>
          <span>Вставьте сообщение по доходам за день…</span>
        </div>
        <span>{period}</span>
      </div>
      <textarea
        ref={fieldRef}
        className="flash-income-input__field"
        rows={2}
        maxLength={4000}
        aria-label="Сообщение по доходам за день"
        placeholder="Вставьте сообщение по доходам за день…"
        value={text}
        onChange={event => {
          setText(event.target.value);
          setError(null);
          setToast(null);
        }}
      />
      <div className="flash-income-input__actions">
        <button type="button" className="primary-button" disabled={!text.trim() || isLoading || isConfirming} onClick={() => void parse()}>
          {isLoading ? <><LoaderCircle size={14} className="flash-income-spinner" /> Разбираем…</> : 'Разобрать'}
        </button>
        <button type="button" className="secondary-button" disabled={isLoading || isConfirming} onClick={clear}>
          Очистить
        </button>
      </div>

      {error && <div className="flash-income-input__error" role="alert">{error}</div>}
      {parsed && (
        <div className="flash-income-preview" aria-live="polite">
          <div className="flash-income-preview__head"><strong>Распознано</strong></div>
          <div className="flash-income-preview__rows">
            <div className="flash-income-preview__row"><span className="flash-income-preview__label">Дата</span><span className="flash-income-preview__value">{parsed.date ?? 'Не распознана'}</span></div>
            {needsDate && (
              <label className="flash-income-preview__row">
                <span className="flash-income-preview__label">Укажите дату</span>
                <input type="date" value={selectedDate} onChange={event => setSelectedDate(event.target.value)} min={period + '-01'} />
              </label>
            )}
            <div className="flash-income-preview__row"><span className="flash-income-preview__label">Выручка</span><span className="flash-income-preview__value">{money(parsed.revenue)}</span></div>
            <div className="flash-income-preview__row"><span className="flash-income-preview__label">Наличные</span><span className="flash-income-preview__value">{money(parsed.cash)}</span></div>
            <div className="flash-income-preview__row"><span className="flash-income-preview__label">Карта</span><span className="flash-income-preview__value">{money(parsed.card)}</span></div>
            <div className="flash-income-preview__row"><span className="flash-income-preview__label">Скидки</span><span className="flash-income-preview__value">{money(parsed.discounts)}</span></div>
            <div className="flash-income-preview__row"><span className="flash-income-preview__label">Чеков</span><span className="flash-income-preview__value">{parsed.checks ?? '—'}</span></div>
            <div className="flash-income-preview__row"><span className="flash-income-preview__label">Ресторан</span><span className="flash-income-preview__value">{parsed.restaurant ?? 'Не распознан'}</span></div>
            {needsRestaurant && (
              <label className="flash-income-preview__row">
                <span className="flash-income-preview__label">Выберите ресторан</span>
                <select value={selectedRestaurant} onChange={event => setSelectedRestaurant(event.target.value)}>
                  <option value="">Выберите ресторан</option>
                  {restaurants.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="flash-income-preview__actions">
            <button type="button" className="primary-button" disabled={isLoading || isConfirming || needsDate || needsRestaurant} onClick={() => void confirm()}>
              {isConfirming ? <><LoaderCircle size={14} className="flash-income-spinner" /> Сохраняем…</> : <><Check size={14} /> Подтвердить и сохранить</>}
            </button>
            <button type="button" className="secondary-button" disabled={isLoading || isConfirming} onClick={() => { setError(null); fieldRef.current?.focus(); }}>
              <Pencil size={14} /> Исправить
            </button>
          </div>
        </div>
      )}
      {toast && <div className="flash-income-input__toast" role="status" aria-live="polite">{toast}</div>}
    </section>
  );
}
