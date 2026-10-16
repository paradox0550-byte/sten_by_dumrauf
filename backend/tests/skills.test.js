'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSkillPrompt, selectSkills } = require('../core/skills');

test('greeting stays conversational and does not force restaurant analytics', () => {
  const skills = selectSkills('Привет');
  assert.equal(skills.length, 1);
  assert.equal(skills[0].name, 'general');
  assert.match(buildSkillPrompt('Привет'), /small talk|приветствие/iu);
});

test('all response modes receive execution-first and document-source rules', () => {
  for (const question of ['Привет', 'Какая самая высокая зарплата в файле?', 'Рассчитай мотивацию менеджера']) {
    const prompt = buildSkillPrompt(question);
    assert.match(prompt, /РЕЗУЛЬТАТ ПРЕЖДЕ ОБЪЯСНЕНИЙ/u);
    assert.match(prompt, /search_documents/u);
    assert.match(prompt, /read_document/u);
    assert.match(prompt, /has_more=false/u);
    assert.match(prompt, /get_documents со status=all/u);
    assert.match(prompt, /Не выдумывай номер строки или листа/u);
    assert.match(prompt, /имя и должность/u);
  }
});

test('HR skill allows source-grounded names for authorized tasks but protects unrelated sensitive data', () => {
  const prompt = buildSkillPrompt('Найди зарплату сотрудника и рассчитай мотивацию');
  assert.match(prompt, /ФИО и должность можно назвать только если они прямо содержатся в источнике/u);
  assert.match(prompt, /Не раскрывай телефоны, паспортные данные/u);
});
