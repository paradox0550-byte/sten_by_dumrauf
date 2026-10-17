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

test('protocol forbids unsupported claims of completed actions', () => {
  const prompt = buildSkillPrompt('Составь план действий по отклонениям P&L');
  assert.match(prompt, /пока инструмент не подтвердил результат/);
});
