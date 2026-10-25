import { useEffect, useMemo, useState } from 'react';
import { useAnalyticsSettings } from '../lib/useAnalyticsSettings';
import { Activity, AlertTriangle, BarChart3, CheckCircle2, Database, RefreshCw, Settings2, GitBranch } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useScope } from '../lib/useScope';
import { scopeQuery } from '../lib/scope';
import { aggregateLaborRecords, finiteNumber } from '../lib/financialAnalytics';
import { aggregateDailySalesReports, type DailySalesReport } from '../lib/dailySalesAnalytics';
import { analyticsActionStorageKey, readAnalyticsActionStates, writeAnalyticsActionStates, type AnalyticsActionStates } from '../lib/analyticsActionStorage';

type Row = { article?: string; plan?: number | null; fact?: number | null; source?: string };
type CalculatedPnl = { revenue?: number | null; cogs?: number | null; personnel?: number | null; labor?: number | null; opex?: number | null; operatingExpenses?: number | null; ebitda?: number | null; netProfit?: number | null; foodCostPercent?: number | null; personnelPercent?: number | null; opexPercent?: number | null; ebitdaMargin?: number | null; netMargin?: number | null; primeCostPercent?: number | null };
type PnlCalculated = { fact?: CalculatedPnl; plan?: CalculatedPnl } | null;
type Labor = { period?: string; department?: string | null; hours?: unknown; amount?: unknown };
const finite = finiteNumber;
const money = (v: number | undefined) => finite(v) == null ? 'Нет данных' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v!);
const pct = (v: number | undefined) => finite(v) == null ? 'Нет данных' : v!.toFixed(1).replace('.', ',') + ' %';
const delta = (v: number | undefined) => finite(v) == null ? '—' : (v! > 0 ? '+' : '') + new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v!);
const pick = (rows: Row[], terms: string[]) => rows.find(row => terms.some(term => String(row.article || '').toLowerCase().replace(/ё/g, 'е').includes(term)));

const classifyFinancialRow = (article: string): 'revenue' | 'expense' | 'unknown' => {
  const value = String(article || '').toLowerCase().replace(/ё/g, 'е');
  if (/выруч|revenue|sales|оборот|доход от продаж/.test(value)) return 'revenue';
  if (/cogs|food.?cost|себестоим|фот|фонд оплаты|зарплат|payroll|personnel|labor|opex|операцион|аренд|коммунал|маркетинг|ремонт|расход|затрат|налог|амортизац|процент|прочие расходы/.test(value)) return 'expense';
  return 'unknown';
};

export default function Analytics() {
  const [scope] = useScope(); const [rows, setRows] = useState<Row[]>([]); const [calculated, setCalculated] = useState<PnlCalculated>(null); const [labor, setLabor] = useState<Labor[]>([]); const [dailyReports, setDailyReports] = useState<DailySalesReport[]>([]); const [salesError, setSalesError] = useState('');
  const { settings } = useAnalyticsSettings();
  const actionStorageKey = analyticsActionStorageKey(scope);
  const [actionStatesByScope, setActionStatesByScope] = useState<Record<string, AnalyticsActionStates>>(() => ({ [actionStorageKey]: readAnalyticsActionStates(scope) }));
  const actionStates = actionStatesByScope[actionStorageKey] ?? {};
  useEffect(() => {
    if (actionStatesByScope[actionStorageKey] === undefined) {
      setActionStatesByScope((current) => ({ ...current, [actionStorageKey]: readAnalyticsActionStates(scope) }));
    }
  }, [actionStorageKey, scope, actionStatesByScope]);
  const saveActionStates = (next: AnalyticsActionStates) => {
    setActionStatesByScope((current) => ({ ...current, [actionStorageKey]: next }));
    writeAnalyticsActionStates(scope, next);
  };
  const updateActionState = (key: string, status: 'recommended' | 'accepted' | 'confirmed', note: string) => {
    saveActionStates({ ...actionStates, [key]: { ...(actionStates[key] ?? { note: '' }), status, note } });
  };
 const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [accessDenied, setAccessDenied] = useState(false); const [laborError, setLaborError] = useState(''); const [pnlUpdatedAt, setPnlUpdatedAt] = useState<string>(''); const [laborUpdatedAt, setLaborUpdatedAt] = useState<string>('');
  async function load(){setLoading(true);setError('');setLaborError('');setSalesError('');const q=scopeQuery(scope);const [pnlResult,fotResult,salesResult]=await Promise.allSettled([api.get<any>('/api/pnl?'+q),api.get<any>('/fot-analytics?'+q),api.get<any>('/reports?'+q)]);const scopeDenied=[pnlResult,fotResult,salesResult].some(result=>result.status==='rejected'&&result.reason instanceof ApiError&&result.reason.status===403&&result.reason.code==='SCOPE_ACCESS_CHECK_FAILED');if(scopeDenied){setRows([]);setCalculated(null);setLabor([]);setDailyReports([]);setAccessDenied(true);setError('Нет доступа к данным выбранного ресторана. Выберите другой рабочий контур или обратитесь к администратору.');setLaborError('Нет доступа');setSalesError('Нет доступа');setLoading(false);return;}if(pnlResult.status==='fulfilled'){const pnl=pnlResult.value;setRows(Array.isArray(pnl?.rows)?pnl.rows:[]);setCalculated((pnl?.calculated??pnl?.summary?.calculated??null) as PnlCalculated);setPnlUpdatedAt(new Date().toISOString())}else{setRows([]);setCalculated(null);setError(pnlResult.reason instanceof Error?pnlResult.reason.message:'Не удалось загрузить P&L.')}if(fotResult.status==='fulfilled'){const fot=fotResult.value;setLabor(Array.isArray(fot?.records)?fot.records.filter((x:Labor)=>x.period===scope.period):[]);setLaborUpdatedAt(new Date().toISOString())}else{setLabor([]);setLaborError(fotResult.reason instanceof Error?fotResult.reason.message:'Не удалось загрузить аналитику ФОТ.')}if(salesResult.status==='fulfilled'){const data=salesResult.value;setDailyReports(Array.isArray(data?.reports)?data.reports:[])}else{setDailyReports([]);setSalesError(salesResult.reason instanceof Error?salesResult.reason.message:'Не удалось загрузить отчёты смен.')}setLoading(false)}
  useEffect(()=>{void load()},[scope.period,scope.projectId,scope.branchId,scope.restaurantId,scope.departmentId]);
  const summaryRows=useMemo(()=>rows.map(row=>({...row,article:String(row.article??'Без названия'),plan:finite(row.plan),fact:finite(row.fact)})),[rows]);
  const sales = useMemo(() => aggregateDailySalesReports(dailyReports, scope.period), [dailyReports, scope.period]);
  const salesMoney = (key: 'revenue' | 'cash' | 'card' | 'discounts') => sales.fields[key].total == null ? 'Нет данных' : money(sales.fields[key].total);
  const metrics=useMemo(()=>{const fact=calculated?.fact,plan=calculated?.plan;const r=finite(fact?.revenue),rp=finite(plan?.revenue),c=finite(fact?.cogs),cp=finite(plan?.cogs),l=finite(fact?.labor),lp=finite(plan?.labor),o=finite(fact?.operatingExpenses??fact?.opex),op=finite(plan?.operatingExpenses??plan?.opex);return{r,rp,c,cp,l,lp,o,op,revenueDelta:r!=null&&rp!=null?r-rp:undefined,cogsDelta:c!=null&&cp!=null?c-cp:undefined,laborDelta:l!=null&&lp!=null?l-lp:undefined,opexDelta:o!=null&&op!=null?o-op:undefined,ebitda:finite(fact?.ebitda),ebitdaPlan:finite(plan?.ebitda),foodCost:finite(fact?.foodCostPercent),laborCost:finite(fact?.personnelPercent)};},[calculated]);
  const incomeExpenseControl = useMemo(() => summaryRows.flatMap((row) => {
    const plan = finite(row.plan), fact = finite(row.fact), type = classifyFinancialRow(String(row.article || ''));
    if (plan === undefined || fact === undefined) return [];
    const difference = fact - plan;
    if (difference === 0) return [];
    const impact = type === 'revenue' ? difference : type === 'expense' ? -difference : undefined;
    return [{ article: String(row.article || 'Статья без названия'), plan, fact, difference, type, impact }];
  }).sort((a, b) => {
    const ai = a.impact === undefined ? -1 : Math.abs(a.impact);
    const bi = b.impact === undefined ? -1 : Math.abs(b.impact);
    return bi - ai;
  }), [summaryRows]);
  const priorityChecks = useMemo(() => incomeExpenseControl
    .filter((item) => item.impact !== undefined && item.impact < 0)
    .map((item) => {
      const article = item.article.toLowerCase().replace(/ё/g, 'е');
      let check = 'Проверьте первичный документ, классификацию статьи и полноту факта/плана.';
      let evidence = 'Подтверждено неблагоприятное отклонение; причина не установлена.';
      if (/выруч|revenue|sales|оборот|доход от продаж/.test(article)) {
        check = 'Сверьте дневные отчёты с P&L, затем проверьте количество чеков, средний чек, скидки и каналы продаж.';
        evidence = 'Выручка ниже плана. Данных по чекам и каналам недостаточно, чтобы определить причину.';
      } else if (/cogs|food.?cost|себестоим|продукт/.test(article)) {
        check = 'Проверьте закупочные цены, списания, инвентаризацию, выход блюд и соблюдение техкарт.';
        evidence = 'Расходы выше плана; товарные движения и техкарты не подключены к этому выводу.';
      } else if (/фот|фонд оплаты|зарплат|payroll|personnel|labor|персонал/.test(article)) {
        check = 'Сверьте график и табель с загрузкой, переработками, заменами и начислениями.';
        evidence = 'ФОТ выше плана; связь с производительностью пока не доказана.';
      } else if (/opex|операцион|аренд|коммунал|маркетинг|ремонт|расход|затрат|налог|амортизац|процент/.test(article)) {
        check = 'Проверьте первичные документы и договоры, отделите разовые расходы от регулярных и проверьте дату признания.';
        evidence = 'Расходы выше плана; требуется проверка документов и структуры затрат.';
      }
      return { ...item, check, evidence };
    }), [incomeExpenseControl]);

  const salesDiagnostics = useMemo(() => {
    const reportRevenue = sales.fields.revenue.total;
    const pnlRevenue = metrics.r;
    const discounts = sales.fields.discounts.total;
    return {
      reportRevenue, pnlRevenue,
      revenueDifference: reportRevenue !== undefined && pnlRevenue !== undefined ? reportRevenue - pnlRevenue : undefined,
      discountRate: discounts !== undefined && reportRevenue !== undefined && reportRevenue > 0 ? discounts / reportRevenue * 100 : undefined,
      discounts, averageCheck: sales.averageCheck.value,
      dailyRevenue: reportRevenue !== undefined && sales.daysWithReports > 0 ? reportRevenue / sales.daysWithReports : undefined,
    };
  }, [sales, metrics.r]);
  const incompleteFinancialRows = useMemo(() => summaryRows.filter((row) =>
    finite(row.plan) === undefined || finite(row.fact) === undefined
  ), [summaryRows]);
  const laborAggregation=useMemo(()=>aggregateLaborRecords(labor),[labor]); const laborRows=laborAggregation.groups;
  const laborDiagnostics = useMemo(() => {
    const pnlPayroll = metrics.l == null ? undefined : Math.abs(metrics.l);
    const sourcePayroll = laborAggregation.totalAmount;
    return {
      pnlPayroll, sourcePayroll,
      difference: pnlPayroll !== undefined && sourcePayroll !== undefined ? sourcePayroll - pnlPayroll : undefined,
      hourlyCost: laborAggregation.totalHours != null && laborAggregation.totalHours > 0 && sourcePayroll != null ? sourcePayroll / laborAggregation.totalHours : undefined,
      hours: laborAggregation.totalHours,
    };
  }, [metrics.l, laborAggregation]);
  const totalHours=laborAggregation.totalHours; const totalPayroll=laborAggregation.totalAmount;
  const revenuePerHour=metrics.r!=null&&metrics.r>=0&&laborAggregation.totalHours!=null&&laborAggregation.totalHours>0?metrics.r/laborAggregation.totalHours:undefined; const laborPerHour=laborAggregation.totalHours!=null&&laborAggregation.totalHours>0&&laborAggregation.totalAmount!=null?laborAggregation.totalAmount/laborAggregation.totalHours:undefined;
  const forecast=useMemo(()=>{if(!settings.forecast||metrics.r==null||metrics.r<=0)return undefined;const now=new Date(),[y,m]=scope.period.split('-').map(Number);if(now.getFullYear()!==y||now.getMonth()+1!==m)return undefined;const days=new Date(y,m,0).getDate();return metrics.r/now.getDate()*days},[metrics.r,scope.period,settings.forecast]);
  const gaps=[metrics.c==null?'COGS / себестоимость':null,metrics.l==null?'ФОТ':null,metrics.o==null?'OPEX':null,!laborRows.length?'ФОТ по часам':null,'Продажи по гостям/чекам','Daypart и каналы','Menu Engineering'].filter(Boolean) as string[];
  const driver=(label:string,f:number|undefined,p:number|undefined,sign=-1)=>{const d=f!=null&&p!=null?f-p:undefined;const impact=d==null?undefined:label==='Выручка'?d:sign*d;return <div key={label}><b>{label}</b><span>{money(f)} ₽</span><span>{money(p)} ₽</span><strong className={impact==null ? '' : impact > 0 ? 'positive' : 'negative'}>{impact==null ? '—' : (impact>=0?'+':'') + money(impact) + ' ₽'}</strong><small>{d==null?'Нет расчёта':'факт-план: '+delta(d)+' ₽'}</small></div>};
  return <div className="page analytics-page">
    <div className="page-head"><div><span className="eyebrow"><BarChart3 size={12}/> АНАЛИТИЧЕСКИЙ КОНТУР</span><h1>Аналитика</h1><p>Что произошло → почему → где деньги → какое действие следует проверить.</p></div><button className="secondary-button"onClick={()=>void load()}disabled={loading}><RefreshCw size={15}/>Обновить</button></div>
    {error&&<div className="panel empty-state"><b>{accessDenied?'Нет доступа':'Не удалось обновить отчёт'}</b><span>{error}</span></div>}
    {accessDenied ? <div className="panel empty-state"><b>Нет доступа</b><span>Данные этого ресторана скрыты. Выберите другой рабочий контур в Настройках или обратитесь к администратору.</span></div> : loading?<div className="panel empty">Загружаем аналитический отчёт…</div>:<>
      {settings.financial&&<section className="analytics-summary"><div><span className="eyebrow">ИТОГ ПЕРИОДА</span><p>Выручка {money(metrics.r)} ₽ · EBITDA {money(metrics.ebitda)} ₽ · Food Cost {pct(metrics.foodCost)} · Labor Cost {pct(metrics.laborCost)}</p></div><div className="analytics-summary-delta"><small>Δ EBITDA к плану</small><strong>{metrics.ebitda==null||metrics.ebitdaPlan==null?'Нет данных':delta(metrics.ebitda-metrics.ebitdaPlan)+' ₽'}</strong><span>Расчёт из подтверждённых P&L статей</span></div></section>}
      {settings.financial&&<section className="panel analytics-report-section"><div className="panel-title"><GitBranch size={16}/> Driver Tree · EBITDA</div><div className="analytics-report-table driver-tree"><div className="analytics-report-head"><span>Драйвер</span><span>Факт</span><span>План</span><span>Δ</span></div>{driver('Выручка',metrics.r,metrics.rp,1)}{driver('COGS',metrics.c,metrics.cp,-1)}{driver('ФОТ',metrics.l,metrics.lp,-1)}{driver('OPEX',metrics.o,metrics.op,-1)}<div className="finance-total-row"><b>Изменение EBITDA</b><span>—</span><span>—</span><strong>{metrics.ebitda==null||metrics.ebitdaPlan==null?'Нет данных':delta(metrics.ebitda-metrics.ebitdaPlan)+' ₽'}</strong><small>Выручка + COGS + ФОТ + OPEX (расходы со знаком минус)</small></div></div><p className="dashboard-note">Дерево показывает вклад отклонений статей в изменение EBITDA. Это математическая декомпозиция, а не доказанная операционная причина.</p></section>}
      {settings.financial&&<section className="panel analytics-report-section"><div className="panel-title">Финансовый контур</div><div className="analytics-report-table"><div className="analytics-report-head"><span>Показатель</span><span>Факт</span><span>План</span><span>Состояние</span></div><div><b>Выручка</b><span>{money(metrics.r)} ₽</span><span>{money(metrics.rp)} ₽</span><strong>{metrics.revenueDelta==null?'Нет сравнения':(metrics.revenueDelta>=0?'Выше':'Ниже')+' плана на '+money(Math.abs(metrics.revenueDelta))+' ₽'}</strong></div><div><b>Food Cost</b><span>{pct(metrics.foodCost)}</span><span>Порог {settings.foodTarget}%</span><strong>{metrics.foodCost==null?'Нет данных':metrics.foodCost>settings.foodTarget?'Выше порога':'В пределах порога'}</strong></div><div><b>Labor Cost</b><span>{pct(metrics.laborCost)}</span><span>Порог {settings.laborTarget}%</span><strong>{metrics.laborCost==null?'Нет данных':metrics.laborCost>settings.laborTarget?'Выше порога':'В пределах порога'}</strong></div></div></section>}
      <section className="panel analytics-report-section">
        <div className="panel-title">Продажи по отчётам смен · {scope.period}</div>
        {salesError && <p className="dashboard-note">Отчёты смен недоступны: {salesError}</p>}
        <p className="dashboard-note">Источник: Quick Entry / GET /reports. Ниже — сумма только явно заполненных значений в полученных отчётах, а не подтверждённый итог полного месяца. Данные не подменяют P&amp;L и не влияют на EBITDA.</p>
        {sales.reportCount > 0 ? <>
          <div className="analytics-kpi-strip">
            <div><small>Выручка по отчётам</small><strong>{salesMoney('revenue')} ₽</strong><span>Заполнено в {sales.fields.revenue.reportCount} отчётах</span></div>
            <div><small>Чеки</small><strong>{sales.fields.checks.total == null ? 'Нет данных' : money(sales.fields.checks.total)}</strong><span>Заполнено в {sales.fields.checks.reportCount} отчётах</span></div>
            <div><small>Средний чек</small><strong>{sales.averageCheck.value == null ? 'Нет данных' : money(sales.averageCheck.value) + ' ₽'}</strong><span>{sales.averageCheck.source === 'calculated' ? 'Выручка / чеки' : sales.averageCheck.source === 'entered' ? 'Среднее введённых значений' : 'Недостаточно данных'}</span></div>
            <div><small>Наличные</small><strong>{salesMoney('cash')} ₽</strong><span>Заполнено в {sales.fields.cash.reportCount} отчётах</span></div>
            <div><small>Карта</small><strong>{salesMoney('card')} ₽</strong><span>Заполнено в {sales.fields.card.reportCount} отчётах</span></div>
            <div><small>Скидки</small><strong>{salesMoney('discounts')} ₽</strong><span>Заполнено в {sales.fields.discounts.reportCount} отчётах</span></div>
          </div>
          <p className="dashboard-note">Получено отчётов: {sales.reportCount}; дней с отчётами: {sales.daysWithReports}. Отсутствующие даты и поля не считаются нулевыми. Проверьте полноту ввода перед использованием суммы как итога месяца.</p>
          <p className="dashboard-note">{sales.fields.revenue.total != null && metrics.r != null ? <>Сверка источников: продажи по дневным отчётам — {money(sales.fields.revenue.total)} ₽; выручка P&amp;L — {money(metrics.r)} ₽; разница — {money(sales.fields.revenue.total - metrics.r)} ₽. Это диагностическое сравнение разных источников, не автоматическая корректировка P&amp;L.</> : 'Сверка с P&L недоступна: нет подтверждённой выручки хотя бы в одном из источников.'}</p>
        </> : <div className="empty">{salesError ? 'Невозможно показать продажи: источник недоступен.' : 'За выбранный месяц нет полученных отчётов смен с данными.'}</div>}
      </section>
      <section className="panel analytics-report-section"><div className="panel-title">Контроль доходов и расходов · отклонения от плана</div><p className="dashboard-note">Доходы оцениваются по правилу «факт − план», расходы — «план − факт». Это показывает финансовое влияние отклонения, но само по себе не устанавливает операционную причину.</p>{incomeExpenseControl.length>0?<div className="analytics-report-table"><div className="analytics-report-head"><span>Статья</span><span>Факт</span><span>План</span><span>Влияние на результат</span></div>{incomeExpenseControl.map((item)=><div key={item.article}><b>{item.article}</b><span>{money(item.fact)} ₽</span><span>{money(item.plan)} ₽</span><strong className={item.impact===undefined?'':item.impact>0?'positive':'negative'}>{item.impact===undefined?'Тип статьи не определён':(item.impact>0?'+':'')+money(item.impact)+' ₽'}{item.impact!==undefined&&<small>{item.impact>0?'благоприятно к плану':'неблагоприятно к плану'}</small>}</strong></div>)}</div>:<div className="empty">Нет подтверждённых отклонений по статьям с доступными планом и фактом.</div>}{incompleteFinancialRows.length>0&&<div className="analytics-gap-list"><strong>Не включены в оценку влияния — неполные данные:</strong>{incompleteFinancialRows.map((row,i)=><span key={String(row.article||'row')+i}>{row.article||'Статья без названия'} · {finite(row.plan)===undefined?'нет плана':'план есть'} · {finite(row.fact)===undefined?'нет факта':'факт есть'}</span>)}</div>}</section>
      <section className="panel analytics-report-section">
        <div className="panel-title"><AlertTriangle size={16}/> Приоритет проверки · управленческие действия</div>
        <p className="dashboard-note">Ранжирование по величине неблагоприятного влияния. Это подсказки для проверки, а не автоматически установленные причины или распоряжения сотрудникам.</p>
        {priorityChecks.length ? <div className="analytics-report-table">
          <div className="analytics-report-head"><span>Статья</span><span>Влияние</span><span>Что проверить</span><span>Основание</span></div>
          {priorityChecks.map((item) => <div key={item.article}>
            <b>{item.article}</b><strong className="negative">{money(item.impact)} ₽</strong><span>{item.check}</span><small>{item.evidence}</small>
          </div>)}
        </div> : <div className="empty">Нет подтверждённых неблагоприятных отклонений с доступными планом и фактом. Неполные данные не трактуются как нулевое отклонение.</div>}
      </section>
      {settings.labor&&<section className="panel analytics-report-section"><div className="panel-title">ФОТ → часы → производительность → стоимость</div>{laborError&&<div className="dashboard-note">Источник ФОТ недоступен: {laborError}</div>}{laborAggregation.incompleteCount>0&&<div className="dashboard-note">Не включено в расчёты из-за неполных или некорректных значений: {laborAggregation.incompleteCount} записей. Пустые часы и суммы не заменяются нулём.</div>}{laborRows.length?<><div className="analytics-kpi-strip"><div><small>Часы</small><strong>{totalHours == null ? 'Нет данных' : totalHours.toLocaleString('ru-RU',{maximumFractionDigits:1})}</strong><span>Источник ФОТ</span></div><div><small>ФОТ</small><strong>{money(totalPayroll)} ₽</strong><span>Факт</span></div><div><small>Выручка / час</small><strong>{money(revenuePerHour)} ₽</strong><span>Выручка ÷ часы</span></div><div><small>Стоимость часа</small><strong>{money(laborPerHour)} ₽</strong><span>ФОТ ÷ часы</span></div><div><small>Δ ФОТ</small><strong>{money(metrics.laborDelta)} ₽</strong><span>Факт − план</span></div></div><div className="analytics-report-table labor-table"><div className="analytics-report-head"><span>Подразделение</span><span>Часы</span><span>ФОТ</span><span>₽ / час</span></div>{laborRows.map(([d,v])=><div key={d}><b>{d}</b><span>{v.hours.toLocaleString('ru-RU',{maximumFractionDigits:1})} ч</span><span>{money(v.amount)} ₽</span><strong>{v.hours?money(v.amount/v.hours)+' ₽':'Нет данных'}</strong></div>)}</div></>:<div className="empty">{laborError?'Источник ФОТ недоступен: '+laborError:'Нет полных подтверждённых записей ФОТ. Производительность не рассчитывается.'}</div>}</section>}

      <section className="panel analytics-report-section">
        <div className="panel-title"><GitBranch size={16}/> Продажи · разбор отклонения</div>
        <p className="dashboard-note">Сопоставляются только полученные отчёты смен и P&amp;L. Покрытие дат может быть неполным; сравнение не меняет P&amp;L.</p>
        <div className="analytics-kpi-strip">
          <div><small>Выручка по сменам</small><strong>{money(salesDiagnostics.reportRevenue)} ₽</strong><span>{sales.fields.revenue.reportCount} отчётов с выручкой</span></div>
          <div><small>Выручка P&amp;L</small><strong>{money(salesDiagnostics.pnlRevenue)} ₽</strong><span>Источник: P&amp;L</span></div>
          <div><small>Разница источников</small><strong>{salesDiagnostics.revenueDifference === undefined ? 'Нет данных' : delta(salesDiagnostics.revenueDifference) + ' ₽'}</strong><span>Отчёты смен − P&amp;L</span></div>
          <div><small>Средний чек</small><strong>{money(salesDiagnostics.averageCheck)} ₽</strong><span>{sales.averageCheck.source === 'calculated' ? 'Выручка ÷ чеки' : sales.averageCheck.source === 'entered' ? 'Введённое значение' : 'Нет данных'}</span></div>
          <div><small>Скидки / продажи</small><strong>{pct(salesDiagnostics.discountRate)}</strong><span>{money(salesDiagnostics.discounts)} ₽ скидок</span></div>
          <div><small>Выручка / день с отчётом</small><strong>{money(salesDiagnostics.dailyRevenue)} ₽</strong><span>Не прогноз на полный месяц</span></div>
        </div>
        <p className="dashboard-note">{salesDiagnostics.revenueDifference === undefined ? 'Сверка недоступна: нет выручки хотя бы в одном источнике.' : Math.abs(salesDiagnostics.revenueDifference) < 1 ? 'Суммы источников практически совпадают; полнота дат всё равно требует проверки.' : 'Есть расхождение источников. Проверьте покрытие дат, дубли отчётов, скидки и соответствие периода до вывода о потерях.'}</p>
        <p className="dashboard-note">Каналы продаж и daypart не подключены: текущий отчёт смен не содержит подтверждённых полей для такого анализа.</p>
      </section>
      <section className="panel analytics-report-section">
        <div className="panel-title"><Database size={16}/> Food Cost · проверка доказательств</div>
        <p className="dashboard-note">Food Cost считается по фактическим COGS и выручке. Причина перерасхода не утверждается без фактов закупок, списаний и инвентаризации.</p>
        <div className="analytics-report-table">
          <div className="analytics-report-head"><span>Контроль</span><span>Что известно</span><span>Что проверить</span><span>Статус данных</span></div>
          <div><b>Фактический Food Cost</b><span>{pct(metrics.foodCost)} · COGS / выручка</span><span>Сверить COGS с выручкой того же периода и проверить знак расходной статьи.</span><strong>{metrics.foodCost === undefined ? 'Нет данных' : 'Расчёт доступен'}</strong></div>
          <div><b>Закупочные цены</b><span>Строки закупок не получены.</span><span>Сравнить цену закупки с предыдущим периодом и договорной ценой.</span><strong>Источник не подключён</strong></div>
          <div><b>Списания и инвентаризация</b><span>Факты списаний и остатки не получены.</span><span>Сверить причины списаний, фактический остаток и учётный остаток.</span><strong>Источник не подключён</strong></div>
          <div><b>Техкарты и выход</b><span>Техкарты и фактический выход блюда недоступны.</span><span>Проверить закладку, выход, порционирование и калькуляцию.</span><strong>Источник не подключён</strong></div>
        </div>
      </section>
      {settings.labor&&<section className="panel analytics-report-section">
        <div className="panel-title"><Activity size={16}/> ФОТ · стоимость, часы и ограничения</div>
        <p className="dashboard-note">Сверка диагностическая и не корректирует P&amp;L. Суммы сопоставимы только при одинаковом периоде и контексте ресторана.</p>
        <div className="analytics-kpi-strip">
          <div><small>ФОТ по P&amp;L</small><strong>{money(laborDiagnostics.pnlPayroll)} ₽</strong><span>Модуль финансов</span></div>
          <div><small>ФОТ по записям</small><strong>{money(laborDiagnostics.sourcePayroll)} ₽</strong><span>ФОТ API</span></div>
          <div><small>Разница источников</small><strong>{laborDiagnostics.difference === undefined ? 'Нет данных' : delta(laborDiagnostics.difference) + ' ₽'}</strong><span>ФОТ API − |P&amp;L ФОТ|</span></div>
          <div><small>Часы</small><strong>{laborDiagnostics.hours == null ? 'Нет данных' : money(laborDiagnostics.hours)}</strong><span>Подтверждённые записи</span></div>
          <div><small>Стоимость часа</small><strong>{money(laborDiagnostics.hourlyCost)} ₽</strong><span>ФОТ API ÷ часы</span></div>
        </div>
        <p className="dashboard-note">График смен, плановые часы и загрузка по чекам/гостям в интервалах не подключены. Без этих данных нельзя делать вывод о «лишнем персонале».</p>
      </section>}

      <section className="panel analytics-report-section">
        <div className="panel-title"><CheckCircle2 size={16}/> Контроль управленческих действий</div>
        <p className="dashboard-note">Статус, ответственный, срок и заметка сохраняются локально в этом браузере отдельно для выбранного периода и рабочего контура. Они не отправляются в API и не синхронизируются между устройствами; отметка «Результат отмечен пользователем» не является независимой проверкой результата.</p>
        {priorityChecks.length ? <div className="analytics-report-table">
          <div className="analytics-report-head"><span>Рекомендация</span><span>Статус</span><span>Решение / доказательство</span><span>Действие</span></div>
          {priorityChecks.map((item) => {
            const key = item.article.toLowerCase();
            const action = actionStates[key] || { status: 'recommended' as const, note: '' };
            return <div key={item.article}>
              <b>{item.article}<small>{item.check}</small></b>
              <span>{action.status === 'recommended' ? 'Рекомендовано' : action.status === 'accepted' ? 'Принято в работу' : 'Подтверждено пользователем'}</span>
              <label><span>Ответственный</span><input value={action.responsible ?? ''} maxLength={120} onChange={(e) => saveActionStates({ ...actionStates, [key]: { ...action, responsible: e.target.value.slice(0, 120) } })} placeholder="Кто выполнит проверку" /></label>
              <label><span>Срок</span><input type="date" value={action.dueDate ?? ''} onChange={(e) => saveActionStates({ ...actionStates, [key]: { ...action, dueDate: e.target.value } })} /></label>
              <label><span>Решение / источник подтверждения</span><textarea value={action.note} maxLength={1000} onChange={(e) => saveActionStates({ ...actionStates, [key]: { ...action, note: e.target.value } })} placeholder="Что решили, какой документ проверили, что подтвердилось" /></label>
              <span>
                <button className="secondary-button" onClick={() => updateActionState(key, 'accepted', actionStates[key]?.note ?? action.note)}>Принять в работу</button>
                <button className="secondary-button" disabled={!(actionStates[key]?.note ?? action.note).trim()} onClick={() => updateActionState(key, 'confirmed', actionStates[key]?.note ?? action.note)}>Отметить результат</button>
                <button className="secondary-button" onClick={() => updateActionState(key, 'recommended', actionStates[key]?.note ?? action.note)}>Сбросить</button>
              </span>
            </div>;
          })}
        </div> : <div className="empty">Нет неблагоприятных отклонений с полными планом и фактом. Неполные данные не превращаются в ноль.</div>}
      </section>
      {settings.forecast&&<section className="panel analytics-report-section"><div className="panel-title">Прогноз темпа</div><div className="analytics-summary"><div><span className="eyebrow">RUN-RATE</span><p>{forecast==null?'Доступен только для текущего месяца при наличии факта выручки.':'При сохранении текущего дневного темпа выручка составит '+money(forecast)+' ₽.'}</p></div></div></section>}
      <section className="panel analytics-report-section"><div className="panel-title"><Database size={16}/> Центр данных</div><div className="analytics-report-table"><div className="analytics-report-head"><span>Источник</span><span>Что подтверждает</span><span>Формула / правило</span><span>Обновлено</span></div><div><b>P&L API</b><span>Выручка, COGS, ФОТ, OPEX</span><span>Статья → факт / план</span><strong>{pnlUpdatedAt?new Date(pnlUpdatedAt).toLocaleTimeString('ru-RU'):'—'}</strong></div><div><b>ФОТ API</b><span>Часы и начисления по подразделениям</span><span>ФОТ ÷ часы = ₽/час</span><strong>{laborUpdatedAt?new Date(laborUpdatedAt).toLocaleTimeString('ru-RU'):'—'}</strong></div><div><b>STEN calculator</b><span>EBITDA и маржи</span><span>Выручка + COGS + ФОТ + OPEX (расходы со знаком минус)</span><strong>детерминированно</strong></div></div><p className="dashboard-note">«Обновлено» означает последний успешный запрос STEN. Серверная дата источника появится после добавления provenance/freshness в API.</p></section>
      <section className="analytics-gap-section"><div className="analytics-gap-head"><div><span className="eyebrow">КАЧЕСТВО ДАННЫХ</span><h2>Что ещё не подключено</h2></div><AlertTriangle size={17}/></div><div className="analytics-gap-list">{gaps.map(g=><span key={g}>{g}</span>)}</div><p>Отсутствующий источник не превращается в ноль. Следующий слой — продажи: гости, чеки, средний чек, daypart и каналы.</p></section>
      <div className="analytics-footer"><Settings2 size={15}/><span>Рабочий контур и пороги задаются в Настройки → Аналитика. Источник и формула показаны рядом с расчётом.</span></div>
    </>}
  </div>;
}
