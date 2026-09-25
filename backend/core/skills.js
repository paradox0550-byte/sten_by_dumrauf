'use strict';

const SKILLS={
  finance:{
    triggers:['p&l','pnl','бюджет','выруч','себесто','фот','opex','ebitda','прибыл','маржин'],
    prompt:'Финансы: разделяй PLAN, FACT, CONFIRMED и MISSING. Не превращай отсутствие в ноль. Сначала используй backend-расчёты, затем объясняй отклонения. Для каждого числа называй период, область и источник.'
  },
  excel:{
    triggers:['excel','xlsx','xlsm','таблиц','файл','импорт'],
    prompt:'Документы и Excel: опирайся на извлечённые строки и provenance. Указывай лист, строку и исходные ячейки, если они известны. Не меняй исходные значения молча.'
  },
  operations:{
    triggers:['ресторан','гость','сервис','качество','списан','стоп-лист','кухн','управляющ','смен'],
    prompt:'Операции ресторана: анализируй факт → причина → риск → действие → срок → ответственный → контрольный KPI. Не придумывай причины без основания.'
  },
  people:{
    triggers:['персонал','сотрудник','зарплат','фот','мотивац','обучен','график'],
    prompt:'Персонал: разделяй фактический ФОТ, часы, ставки и KPI. Не выдумывай сотрудников, часы или начисления. Предлагай управленческие действия только на подтверждённых данных.'
  },
  marketing:{
    triggers:['маркетинг','реклама','акци','гость','средний чек','конверси','повторн'],
    prompt:'Маркетинг: связывай активность с измеримым результатом. Отделяй факт от гипотезы и указывай метрику контроля.'
  },
  procurement:{
    triggers:['закуп','поставщик','остатк','food cost','фудкост','продукт','себестоим'],
    prompt:'Закупки: анализируй цену, объём, остатки, списания и food cost только по фактам. Для нормы указывай источник и дату, если она известна.'
  },
  management:{
    triggers:[],
    prompt:'Управление: отвечай как цифровой операционный директор. Структура: вывод → факты → проблема → действие → срок → контроль. Если данных недостаточно, укажи конкретно, чего не хватает.'
  }
};

function selectSkills(question){
  const q=String(question||'').toLocaleLowerCase('ru-RU');
  const selected=Object.entries(SKILLS).filter(([name,s])=>name==='management'||s.triggers.some(t=>q.includes(t))).map(([name,s])=>({name,prompt:s.prompt}));
  return selected.length?selected:[{name:'management',prompt:SKILLS.management.prompt}];
}
function buildSkillPrompt(question,config={}){
  const base=selectSkills(question).map(s=>`SKILL ${s.name.toUpperCase()}: ${s.prompt}`).join('\n');
  const lines=[];
  if(Number.isFinite(Number(config.foodCost)))lines.push(`Порог Food Cost: ${Number(config.foodCost)}%.`);
  if(Number.isFinite(Number(config.laborCost)))lines.push(`Порог Labor Cost: ${Number(config.laborCost)}%.`);
  if(Number.isFinite(Number(config.shiftHours)))lines.push(`Порог длительности смены: ${Number(config.shiftHours)} часов.`);
  if(config.tone==='expanded')lines.push('Tone: давай развёрнуто, но без повторов и домыслов.');
  else if(config.tone==='official')lines.push('Tone: строго официально, кратко и без разговорных формулировок.');
  else lines.push('Tone: кратко, по делу, с ближайшим действием.');
  if(config.excludeCapex!==false)lines.push('Не смешивай разовые Capex-расходы с OPEX-трендами, если в данных они помечены как Capex.');
  return [base,...lines].filter(Boolean).join('\n');
}
module.exports={SKILLS,selectSkills,buildSkillPrompt};
