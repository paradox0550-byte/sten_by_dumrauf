'use strict';

// STEN agent registry. Agents share the existing YandexGPT runtime and the
// authenticated, policy-checked tools; each specialist receives only its own tools.
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
      'get_pnl',
      'find_deviations',
      'get_documents',
      'read_document',
      'search_documents',
      'get_memory',
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
    ].join('\n'),
  }),
});

const FINANCE_PATTERNS = [
  /p\s*&\s*l|\bpnl\b/iu,
  /прибыл|убыт|выручк|расход|бюджет|план\s*[-/]?\s*факт|отклонен/iu,
  /себестоим|фудкост|food\s*cost|labor\s*cost|prime\s*cost|ebitda|маржин/iu,
  /денежн|opex|\bфот\b|перерасход|теряем\s+деньги|финансов/iu,
  /экономи|аренд|дебитор|кредитор|падени.{0,20}выруч|стоимость\s+отклонен/iu,
];

function isFinanceQuestion(question) {
  const text = String(question || '').trim();
  return Boolean(text) && FINANCE_PATTERNS.some(pattern => pattern.test(text));
}

function resolveAgent(question) {
  return isFinanceQuestion(question) ? AGENTS.finance_diagnostics : AGENTS.sten;
}

function toolsForAgent(tools, agent) {
  if (!agent || !Array.isArray(agent.allowedTools)) return tools;
  const allowed = new Set(agent.allowedTools);
  return tools.filter(tool => allowed.has(tool.name));
}

function agentAllowsTool(agent, toolName) {
  return !agent || !Array.isArray(agent.allowedTools) || agent.allowedTools.includes(toolName);
}

module.exports = { AGENTS, isFinanceQuestion, resolveAgent, toolsForAgent, agentAllowsTool };
