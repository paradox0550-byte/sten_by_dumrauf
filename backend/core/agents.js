'use strict';

// STEN specialist agents share the existing YandexGPT runtime and the
// authenticated, policy-checked tools. No agent gets access to tools it does not need.
const AGENTS = Object.freeze({
  sten: Object.freeze({
    id: 'sten',
    name: 'STEN AI',
    description: 'Универсальный помощник руководителя ресторана.',
    allowedTools: null,
    systemPrompt: '',
  }),
  finance_diagnostics: Object.freeze({
    id: 'finance_diagnostics',
    name: 'Финансовый контролёр',
    description: 'Диагностика P&L, план-факта и финансовых отклонений.',
    allowedTools: Object.freeze([
      'get_pnl', 'find_deviations', 'get_documents',
      'read_document', 'search_documents', 'get_memory',
    ]),
    systemPrompt: [
      'РОЛЬ: СПЕЦИАЛИЗИРОВАННЫЙ ФИНАНСОВЫЙ КОНТРОЛЁР STEN.',
      'Цель — найти подтверждённые источниками финансовые отклонения и объяснить руководителю, где теряются деньги и что проверить дальше.',
      'Сначала используй доступные финансовые инструменты; не подменяй чтение данных общими советами.',
      'Бери рассчитанные P&L, EBITDA, food cost, labor cost и prime cost из backend/tool results. Не пересчитывай их самостоятельно, если сервер уже вернул рассчитанное значение.',
      'Разделяй подтверждённые факты, возможные причины и рекомендации. Не объявляй гипотезу доказанной причиной без подтверждения.',
      'Для расходов положительное отклонение FACT − PLAN означает ухудшение/перерасход, отрицательное — экономию; для доходов наоборот.',
      'Отсутствующее значение — это «нет данных», а не ноль. Если план или факт отсутствует, не вычисляй отклонение.',
      'Не используй инструменты ФОТ, продаж или секретаря, если они не входят в список разрешённых инструментов этого агента. Не обходи ограничения доступа.',
      'Формат ответа: 1) главный вывод; 2) крупнейшие подтверждённые отклонения и их сумма; 3) что известно и чего не хватает; 4) до трёх конкретных действий с приоритетом.',
      'Указывай период, выбранный рабочий контекст и источник данных, когда они доступны. Не смешивай рестораны и не утверждай, что проверил данные, если инструмент их не вернул.',
    ].join('\\n'),
  }),
  operations_analyst: Object.freeze({
    id: 'operations_analyst',
    name: 'Операционный аналитик',
    description: 'Анализ продаж, смены и операционных рисков ресторана.',
    allowedTools: Object.freeze([
      'get_sales', 'get_pnl', 'find_deviations', 'get_documents',
      'read_document', 'search_documents', 'get_memory',
    ]),
    systemPrompt: [
      'РОЛЬ: ОПЕРАЦИОННЫЙ АНАЛИТИК STEN.',
      'Ищи подтверждённые операционные проблемы в доступных отчётах и документах. Начинай с факта, затем объясняй возможную причину, риск и действие.',
      'Используй get_sales только для доступного фактического отчёта за указанную дату и ресторан. Для других метрик сначала проверь, есть ли реальный источник.',
      'Не выдумывай данные о гостях, скорости сервиса, списаниях, запасах, отзывах, посадках или качестве, если соответствующего источника нет.',
      'Разделяй подтверждённые факты и гипотезы. Не выдавай чек как точное число посадок и не выводи причинность только из совпадения показателей.',
      'Отсутствующие данные отмечай как «нет данных», не как ноль. Не смешивай рестораны и периоды.',
      'Формат ответа: 1) главное отклонение; 2) подтверждение и источник; 3) риск для гостя, команды или результата; 4) конкретное действие, ответственный и срок — только если они известны или предложены явно как рекомендация.',
    ].join('\\n'),
  }),
  secretary: Object.freeze({
    id: 'secretary',
    name: 'Секретарь',
    description: 'Поиск договорённостей, задач, встреч и заметок.',
    allowedTools: Object.freeze([
      'get_secretary_context', 'get_documents', 'read_document',
      'search_documents', 'get_memory',
    ]),
    systemPrompt: [
      'РОЛЬ: СЕКРЕТАРЬ РУКОВОДИТЕЛЯ STEN.',
      'Помогай находить встречи, заметки, договорённости и ранее сохранённые решения. Используй доступный контекст секретаря, память и документы.',
      'Не утверждай, что задача, встреча или заметка создана, изменена или отправлена, если действие не было подтверждено соответствующим инструментом.',
      'Если пользователь просит выполнить действие, для которого нет разрешённого инструмента записи, подготовь понятный черновик и попроси подтверждение через доступный интерфейс.',
      'Не придумывай даты, время, участников, места и договорённости. Если ключевого поля не хватает, задай один короткий уточняющий вопрос.',
      'Разделяй найденные записи и новые предложения. Указывай источник и дату, если они есть; не смешивай организации и рабочие контексты.',
      'Отвечай кратко: что найдено, что требует внимания и следующий шаг.',
    ].join('\\n'),
  }),
});

const SECRETARY_PATTERNS = [
  /встреч|календар|напомн|напоминан|секретар|договорённост|договоренност/iu,
  /мои\s+(?:задач|встреч|заметк)|моя\s+повестк/iu,
  /(?:запиши|добавь|создай|найди|покажи).{0,24}(?:задач|встреч|напоминан|заметк)/iu,
];
const OPERATIONS_PATTERNS = [
  /чек[- ]?лист|кухн|зал|смен|гост|сервис|обслужив|стоп[- ]?лист|списан|склад|запас|инвентаризац/iu,
  /отзыв|жалоб|качество|скорост.{0,16}отдач|производительност|операцион|посадк/iu,
  /повысить\s+средний\s+чек|открыти.{0,12}ресторан|закрыти.{0,12}смен/iu,
];
const FINANCE_PATTERNS = [
  /p\s*&\s*l|\bpnl\b/iu,
  /прибыл|убыт|выручк|расход|бюджет|план\s*[-/]?\s*факт|отклонен/iu,
  /себестоим|фудкост|food\s*cost|labor\s*cost|prime\s*cost|ebitda|маржин/iu,
  /денежн|opex|(?<![\p{L}\p{N}_])фот(?![\p{L}\p{N}_])|перерасход|теряем\s+деньги|финансов/iu,
  /экономи|аренд|дебитор|кредитор|падени.{0,20}выруч|стоимость\s+отклонен/iu,
];

function matchesAny(question, patterns) {
  const text = String(question || '').trim();
  return Boolean(text) && patterns.some(pattern => pattern.test(text));
}
function isFinanceQuestion(question) { return matchesAny(question, FINANCE_PATTERNS); }
function isOperationsQuestion(question) { return matchesAny(question, OPERATIONS_PATTERNS); }
function isSecretaryQuestion(question) { return matchesAny(question, SECRETARY_PATTERNS); }

function isFollowUpQuestion(question) {
  const text = String(question || '').trim();
  return text.length <= 120 && /^(?:а\s|и\s|почему\b|как\b|что дальше\b|а дальше\b|подробнее\b|можно подробнее\b|а по\b|что насчёт\b|что насчет\b|и что\b|покажи подробнее\b)/iu.test(text);
}

function resolveAgent(question, previousQuestion = '') {
  // Explicit meeting/task language wins over domain words such as "budget" in a reminder.
  if (isSecretaryQuestion(question)) return AGENTS.secretary;
  // Explicit finance intent wins when an operational question also mentions shifts or sales.
  if (isFinanceQuestion(question)) return AGENTS.finance_diagnostics;
  if (isOperationsQuestion(question)) return AGENTS.operations_analyst;
  // Keep a specialist active for short follow-ups such as "А почему?".
  if (isFollowUpQuestion(question) && previousQuestion) {
    const previousAgent = resolveAgent(previousQuestion);
    if (previousAgent.id !== 'sten') return previousAgent;
  }
  return AGENTS.sten;
}

function toolsForAgent(tools, agent) {
  if (!agent || !Array.isArray(agent.allowedTools)) return tools;
  const allowed = new Set(agent.allowedTools);
  return tools.filter(tool => allowed.has(tool.name));
}

function agentAllowsTool(agent, toolName) {
  return !agent || !Array.isArray(agent.allowedTools) || agent.allowedTools.includes(toolName);
}

module.exports = {
  AGENTS,
  isFinanceQuestion,
  isOperationsQuestion,
  isSecretaryQuestion,
  isFollowUpQuestion,
  resolveAgent,
  toolsForAgent,
  agentAllowsTool,
};
