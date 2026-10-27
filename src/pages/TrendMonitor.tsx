import { useMemo, useState } from 'react';
import { Activity, ArrowUpRight, CalendarClock, CheckCircle2, Globe2, Search, ShieldCheck } from 'lucide-react';
import '../styles/trend-monitor.css';

type Market = 'ru' | 'world' | 'both';
type Topic = { id: string; label: string; ru: string[]; world: string[] };

const TOPICS: Topic[] = [
  { id: 'guest', label: 'Поведение гостей', ru: ['изменение поведения гостей ресторанов Россия', 'почему гости реже ходят в рестораны средний чек посещаемость'], world: ['restaurant consumer behavior trends 2026', 'restaurant guest preferences spending frequency 2026'] },
  { id: 'menu', label: 'Меню и напитки', ru: ['новые тренды меню ресторанов Россия', 'популярные блюда напитки рестораны новые форматы'], world: ['food and beverage trends restaurants 2026', 'emerging restaurant menu trends consumer demand'] },
  { id: 'economics', label: 'Ценность и экономика', ru: ['как рестораны адаптируют меню к снижению спроса', 'ресторанные комбо доступное меню маржинальность'], world: ['restaurant value menu trends 2026', 'restaurant profitability food labor costs trends 2026'] },
  { id: 'experience', label: 'Сервис и впечатления', ru: ['тренды гостевого опыта ресторан Россия', 'новые форматы ресторанного сервиса'], world: ['restaurant guest experience trends 2026', 'experiential dining trends restaurant'] },
  { id: 'technology', label: 'Технологии и производительность', ru: ['автоматизация ресторанов снижение затрат', 'ИИ в ресторанном бизнесе реальные кейсы'], world: ['restaurant technology automation productivity 2026', 'AI use cases restaurant operations'] },
  { id: 'people', label: 'Команда и рынок труда', ru: ['кадровые тренды ресторанный бизнес Россия', 'как рестораны решают нехватку персонала'], world: ['restaurant workforce trends 2026', 'restaurant employee retention staffing innovation'] },
];

const SEARCH_PROVIDERS = [
  { id: 'google', label: 'Google', url: 'https://www.google.com/search?q=' },
  { id: 'yandex', label: 'Яндекс', url: 'https://yandex.ru/search/?text=' },
];

function searchUrl(provider: string, query: string) {
  const base = SEARCH_PROVIDERS.find(item => item.id === provider)?.url ?? SEARCH_PROVIDERS[0].url;
  return base + encodeURIComponent(query);
}

export default function TrendMonitor() {
  const [market, setMarket] = useState<Market>('both');
  const [topicId, setTopicId] = useState(TOPICS[0].id);
  const [provider, setProvider] = useState('google');
  const [period, setPeriod] = useState('90');
  const [customQuery, setCustomQuery] = useState('');
  const [monitoringEnabled, setMonitoringEnabled] = useState(false);
  const topic = TOPICS.find(item => item.id === topicId) ?? TOPICS[0];
  const queries = useMemo(() => {
    const selected = market === 'ru' ? topic.ru : market === 'world' ? topic.world : [...topic.ru, ...topic.world];
    return customQuery.trim() ? [customQuery.trim()] : selected;
  }, [customQuery, market, topic]);

  return (
    <main className="trend-page">
      <header className="trend-header">
        <div>
          <span className="trend-eyebrow"><Activity size={14} /> STEN INTELLIGENCE</span>
          <h1>Мониторинг трендов</h1>
          <p>Отслеживайте изменения рынка и проверяйте, заслуживают ли они внимания управляющего.</p>
        </div>
        <div className="trend-status"><span /> Исследовательский контур</div>
      </header>

      <section className="trend-notice" role="status">
        <ShieldCheck size={20} />
        <div><strong>Доказательства важнее популярности</strong><p>Поисковый интерес и публикации помогают обнаружить сигнал, но сами по себе не доказывают спрос или прибыльность.</p></div>
      </section>

      <section className="trend-grid">
        <article className="trend-panel trend-search-panel">
          <div className="trend-panel-heading"><div><span className="trend-step">01</span><h2>Исследование по запросу</h2></div><Search size={19} /></div>
          <p className="trend-muted">Подготовьте поиск по выбранному направлению. Запросы открываются в выбранной поисковой системе; STEN пока не собирает результаты автоматически.</p>

          <label htmlFor="trend-market">Рынок</label>
          <select id="trend-market" value={market} onChange={event => setMarket(event.target.value as Market)}>
            <option value="both">Россия и мировой рынок</option><option value="ru">Россия</option><option value="world">Мировой рынок</option>
          </select>

          <label htmlFor="trend-topic">Тема</label>
          <select id="trend-topic" value={topicId} onChange={event => setTopicId(event.target.value)}>
            {TOPICS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>

          <label htmlFor="trend-provider">Поисковая система</label>
          <select id="trend-provider" value={provider} onChange={event => setProvider(event.target.value)}>
            {SEARCH_PROVIDERS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>

          <label htmlFor="trend-period">Горизонт анализа</label>
          <select id="trend-period" value={period} onChange={event => setPeriod(event.target.value)}>
            <option value="30">Последние 30 дней</option><option value="90">Последние 90 дней</option><option value="365">Последний год</option>
          </select>

          <label htmlFor="trend-custom">Свой поисковый запрос (необязательно)</label>
          <input id="trend-custom" value={customQuery} onChange={event => setCustomQuery(event.target.value)} placeholder="Например: тренды завтраков ресторанов" />

          <div className="trend-query-list">
            {queries.map(query => <div className="trend-query" key={query}><span>{query}</span><a href={searchUrl(provider, query)} target="_blank" rel="noreferrer" aria-label={'Искать: ' + query} title="Открыть поиск"><ArrowUpRight size={16} /></a></div>)}
          </div>
          <button className="trend-primary" onClick={() => window.open(searchUrl(provider, queries[0]), '_blank', 'noopener,noreferrer')}><Search size={16} /> Открыть основной поиск</button>
          <p className="trend-footnote">Период {period} дней выбран для последующей проверки динамики. Обычный поисковый запрос не гарантирует фильтрацию по этому периоду.</p>
        </article>

        <article className="trend-panel">
          <div className="trend-panel-heading"><div><span className="trend-step">02</span><h2>Регулярный мониторинг</h2></div><CalendarClock size={19} /></div>
          <div className="trend-availability"><span className="trend-availability-dot" /><div><strong>Автоматический сбор не подключён</strong><p>Нет подтверждённого источника данных и фонового планировщика для еженедельного обновления.</p></div></div>
          <p className="trend-muted">Интерфейс не будет показывать выдуманные тренды или имитировать обновление. Для автоматического режима необходимы интеграция с поисковым провайдером/открытыми источниками, планировщик и хранилище доказательств.</p>
          <button className="trend-secondary" onClick={() => setMonitoringEnabled(value => !value)} aria-pressed={monitoringEnabled}>
            {monitoringEnabled ? <CheckCircle2 size={16} /> : <CalendarClock size={16} />}
            {monitoringEnabled ? 'Параметры пилота выбраны' : 'Подготовить параметры пилота'}
          </button>
          {monitoringEnabled && <div className="trend-pilot" role="status"><strong>Предлагаемая конфигурация пилота</strong><ul><li>Периодичность: раз в неделю</li><li>Рынки: Россия и мировой рынок</li><li>Темы: 6 тематических групп</li><li>Результат: до 5–7 сигналов после проверки доказательств</li></ul><p>Это черновая конфигурация, не активная задача по расписанию.</p></div>}
        </article>
      </section>

      <section className="trend-panel trend-method">
        <div className="trend-panel-heading"><div><span className="trend-step">03</span><h2>Как подтверждать сигнал</h2></div><CheckCircle2 size={19} /></div>
        <div className="trend-checks">
          <div><strong>01 · Независимость</strong><p>Несколько самостоятельных источников, а не перепечатки одной публикации.</p></div>
          <div><strong>02 · Динамика</strong><p>Сравнение сопоставимых периодов; всплеск просмотров не равен росту спроса.</p></div>
          <div><strong>03 · Устойчивость</strong><p>Повторяемость во времени и отсутствие объяснения только сезонностью.</p></div>
          <div><strong>04 · Рынок</strong><p>По возможности подтверждение реальными действиями ресторанов или отраслевыми данными.</p></div>
          <div><strong>05 · География</strong><p>Россия и мировой рынок оцениваются отдельно.</p></div>
          <div><strong>06 · Применимость</strong><p>Потенциальный эффект, затраты, ограничения и измеримый тест для ресторана.</p></div>
        </div>
      </section>

      <footer className="trend-footer"><Globe2 size={15} /> Источники и актуальность проверяются вручную в этой версии. Никаких демонстрационных трендов или придуманных оценок не показывается.</footer>
    </main>
  );
}
