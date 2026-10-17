'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSkillPrompt, selectSkills } = require('../core/skills');

test('global task-completion protocol is included for general questions', () => {
  const prompt = buildSkillPrompt('Привет');
  assert.match(prompt, /ПРОТОКОЛ ВЫПОЛНЕНИЯ ЗАДАЧ STEN/);
  assert.match(prompt, /Сначала выполни задачу пользователя/);
  assert.match(prompt, /не выдумывай имена, цифры, файлы, источники и идентификаторы/i);
  assert.match(prompt, /organization_id, restaurant_id/);
});

test('general greeting does not get forced into business mode', () => {
  assert.deepEqual(selectSkills('Привет').map(skill => skill.name), ['general']);
});

test('document and calculation questions retain specialist skills plus global protocol', () => {
  const prompt = buildSkillPrompt('Посчитай мотивацию менеджера по Excel');
  assert.match(prompt, /SKILL: EXCEL/);
  assert.match(prompt, /SKILL: PEOPLE/);
  assert.match(prompt, /ПРОТОКОЛ ВЫПОЛНЕНИЯ ЗАДАЧ STEN/);
  assert.match(prompt, /формулу\/логику/);
});

test('restaurant table turnover distinguishes actual seatings from checks', () => {
  const skills = selectSkills('Как посчитать оборачиваемость столов за день?');
  assert.ok(skills.some(skill => skill.name === 'operations'));
  const prompt = buildSkillPrompt('Как посчитать оборачиваемость столов за день?');
  assert.match(prompt, /число фактических посадок/u);
  assert.match(prompt, /Закрытые чеки — лишь приближение/u);
  assert.match(prompt, /не тождественны/u);
});

test('ambiguous marking question receives context-sensitive operations guidance', () => {
  const skills = selectSkills('Как организовать маркировку продуктов на кухне?');
  assert.ok(skills.some(skill => skill.name === 'operations'));
  const prompt = buildSkillPrompt('Как организовать маркировку продуктов на кухне?');
  assert.match(prompt, /Сначала определи объект и цель маркировки/u);
  assert.match(prompt, /Не выдавай общий список за юридически проверенный регламент/u);
});

test('HACCP and current 2026 Russian catering SanPiN use compliance guidance', () => {
  const skills = selectSkills('Какие требования ХАССП и СанПиН действуют для ресторана в 2026 году?');
  assert.ok(skills.some(skill => skill.name === 'compliance'));
  assert.ok(skills.some(skill => skill.name === 'operations'));
  const prompt = buildSkillPrompt('Какие требования ХАССП и СанПиН действуют для ресторана в 2026 году?');
  assert.match(prompt, /ТР ТС 021\/2011/u);
  assert.match(prompt, /СанПиН 2\.3\/2\.4\.4282-26/u);
  assert.match(prompt, /01\.09\.2026/u);
  assert.match(prompt, /подтверждены доступным текстом источника/u);
});

test('food safety guidance includes specific new rules without inventing universal shelf lives', () => {
  const prompt = buildSkillPrompt('Как маркировать заготовки и контролировать сроки годности по СанПиН?');
  assert.match(prompt, /не более 3 часов/u);
  assert.match(prompt, /аллергенными свойствами/u);
  assert.match(prompt, /Не выдумывай единые сроки годности или температуры/u);
  assert.match(prompt, /ярлык сохраняют до конца обслуживания/u);
  assert.match(prompt, /приём сырья\/пищевой продукции требует маркировки/u);
  assert.match(prompt, /фритюрные жиры контролируют ежедневно/iu);
});

test('protocol forbids unsupported claims of completed actions', () => {
  const prompt = buildSkillPrompt('Составь план действий по отклонениям P&L');
  assert.match(prompt, /пока инструмент не подтвердил результат/);
});


test('restaurant fire safety requests route to dedicated guidance', () => {
  const question = 'Чек-лист пожарной безопасности ресторана';
  assert.ok(selectSkills(question).some(skill => skill.name === 'fire_safety'));
  const prompt = buildSkillPrompt(question);
  assert.match(prompt, /ПП РФ № 1479/u);
  assert.match(prompt, /эвакуац/u);
});


test('technological card requests receive recipe, yield, and cost calculation guidance', () => {
  const question = 'Составь техкарту блюда на 10 порций и рассчитай себестоимость';
  const skills = selectSkills(question);
  assert.ok(skills.some(skill => skill.name === 'procurement'));
  const prompt = buildSkillPrompt(question);
  assert.match(prompt, /СОСТАВЛЕНИЕ ТК\/ТТК/u);
  assert.match(prompt, /ГОСТ 31987-2012/u);
  assert.match(prompt, /брутто\/нетто/u);
  assert.match(prompt, /выход полуфабрикатов и блюда/u);
  assert.match(prompt, /Не выдумывай сроки хранения/u);
});

test('restaurant marketing strategy includes measurable 30-60-90 day plan', () => {
  const question = 'Разработай маркетинговую стратегию ресторана';
  const skills = selectSkills(question);
  assert.ok(skills.some(skill => skill.name === 'marketing'));
  const prompt = buildSkillPrompt(question);
  assert.match(prompt, /позиционирования/u);
  assert.match(prompt, /ROMI/u);
  assert.match(prompt, /30\/60\/90 дней/u);
  assert.match(prompt, /не предлагай скидку без расчёта экономики/u);
});


test('bar and wine questions receive professional beverage service guidance', () => {
  const question = 'Составь обучение бармена по винам и настойкам';
  const skills = selectSkills(question);
  assert.ok(skills.some(skill => skill.name === 'bar_wine'));
  const prompt = buildSkillPrompt(question);
  assert.match(prompt, /терруар/u);
  assert.match(prompt, /НАСТОЙКИ И ЗАГОТОВКИ/u);
  assert.match(prompt, /не воспроизводи главы\/тексты защищённых книг и курсов дословно/u);
});

test('Russian labor law requests receive current-law and document safeguards', () => {
  const question = 'Проверь график смен по Трудовому кодексу РФ';
  const skills = selectSkills(question);
  assert.ok(skills.some(skill => skill.name === 'labor_law'));
  const prompt = buildSkillPrompt(question);
  assert.match(prompt, /актуальную на дату ответа редакцию ТК РФ/u);
  assert.match(prompt, /универсальную «максимальную смену»/u);
  assert.match(prompt, /защищённым категориям/u);
});

test('restaurant staff management requests receive practical people-development guidance', () => {
  const question = 'Разработай систему управления персоналом ресторана';
  const skills = selectSkills(question);
  assert.ok(skills.some(skill => skill.name === 'staff_management'));
  const prompt = buildSkillPrompt(question);
  assert.match(prompt, /ЦИКЛ СОТРУДНИКА/u);
  assert.match(prompt, /матрицу RACI/u);
  assert.match(prompt, /программа адаптации на 1\/7\/30 дней/u);
  assert.match(prompt, /незаконные штрафы/u);
});

test('franchise packaging includes readiness gates and unit economics for both parties', () => {
  const question = 'Упакуй ресторан во франшизу';
  const skills = selectSkills(question);
  assert.ok(skills.some(skill => skill.name === 'franchise'));
  const prompt = buildSkillPrompt(question);
  assert.match(prompt, /ГОТОВНОСТЬ К ТИРАЖИРОВАНИЮ/u);
  assert.match(prompt, /экономику управляющей компании и франчайзи/u);
  assert.match(prompt, /gap-анализ готовности/iu);
  assert.match(prompt, /коммерческой концессии/u);
});

test('iiko inventory questions include reconciliation and report provenance', () => {
  const question = 'Как вести складской учет и отчеты в iiko?';
  const skills = selectSkills(question);
  assert.ok(skills.some(skill => skill.name === 'iiko_inventory'));
  const prompt = buildSkillPrompt(question);
  assert.match(prompt, /физический остаток, учётный остаток/u);
  assert.match(prompt, /инвентаризационную разниц/u);
  assert.match(prompt, /не выдумывай точный путь меню/u);
  assert.match(prompt, /не объявляй недостачу воровством/u);
});

test('brand strength skill links positioning to measurable guest behavior', () => {
  const question = 'Как понять и усилить силу бренда ресторана?';
  const skills = selectSkills(question);
  assert.ok(skills.some(skill => skill.name === 'brand_strength'));
  const prompt = buildSkillPrompt(question);
  assert.match(prompt, /обещание бренда/u);
  assert.match(prompt, /повторные визиты/u);
  assert.match(prompt, /Не начинай с логотипа/u);
  assert.match(prompt, /гипотез/u);
});

test('restaurant occupational safety requests route to risk assessment guidance', () => {
  const question = 'Сделай оценку профессиональных рисков на кухне ресторана';
  const skills = selectSkills(question);
  assert.ok(skills.some(skill => skill.name === 'occupational_safety'));
  const prompt = buildSkillPrompt(question);
  assert.match(prompt, /порезы ножами/u);
  assert.match(prompt, /иерархии/u);
  assert.match(prompt, /опасность → риск → мера/u);
});
