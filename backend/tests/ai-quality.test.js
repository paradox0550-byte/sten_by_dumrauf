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

test('protocol forbids unsupported claims of completed actions', () => {
  const prompt = buildSkillPrompt('Составь план действий по отклонениям P&L');
  assert.match(prompt, /пока инструмент не подтвердил результат/);
});
