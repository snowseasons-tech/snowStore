const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const course = require('../academy/social-media-marketing/course.js');
const { build } = require('../scripts/build-pages');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'academy', 'social-media-marketing');
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

test('course has nine modules with unique slug ids', () => {
  assert.equal(course.modules.length, 9);
  const ids = course.modules.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, SLUG, `${id} is not a slug`);
});

test('every module has a lesson, outcome, checklist and a three-question quiz', () => {
  for (const m of course.modules) {
    assert.ok(m.title && m.desc, `${m.id}: title and description are required`);
    assert.ok(m.lesson.length >= 1 && m.lesson.every((p) => p.trim().length > 40), `${m.id}: lesson paragraphs too short`);
    assert.ok(m.outcome.trim(), `${m.id}: outcome is required`);
    assert.ok(m.actions.length >= 2, `${m.id}: needs at least two checklist actions`);
    assert.equal(m.quiz.length, 3, `${m.id}: expected three quiz questions`);
  }
});

test('quiz answers point at a real option and every question explains itself', () => {
  const answerIndexes = new Set();
  for (const m of course.modules) {
    for (const item of m.quiz) {
      assert.equal(item.options.length, 4, `${m.id}: each question needs four options`);
      assert.ok(Number.isInteger(item.answer) && item.answer >= 0 && item.answer < item.options.length, `${m.id}: answer index out of range`);
      assert.ok(item.why.trim(), `${m.id}: every question needs feedback text`);
      assert.equal(new Set(item.options).size, item.options.length, `${m.id}: duplicate options`);
      answerIndexes.add(item.answer);
    }
  }
  // Guard against a quiz where the right answer is always in the same position.
  assert.ok(answerIndexes.size > 1, 'correct answers should vary in position');
});

test('course text does not reproduce or name the copyrighted textbook', () => {
  const text = JSON.stringify(course);
  for (const forbidden of ['For Dummies', 'Krasniak', 'Wiley', 'z-library']) {
    assert.ok(!text.includes(forbidden), `course text mentions ${forbidden}`);
  }
});

test('course page loads the course data and the storage key is versioned', () => {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.match(html, /<script src="course\.js"><\/script>/);
  assert.match(html, /snowseasons-smm-academy-v1/);
  assert.doesNotMatch(html, /\.innerHTML\s*=/, 'page should build DOM nodes, not assign innerHTML');
});

test('the public build publishes the course page and its data', () => {
  const out = build({ root, out: fs.mkdtempSync(path.join(os.tmpdir(), 'academy-')) });
  assert.ok(fs.existsSync(path.join(out, 'academy', 'social-media-marketing', 'index.html')));
  assert.ok(fs.existsSync(path.join(out, 'academy', 'social-media-marketing', 'course.js')));
  assert.ok(!fs.existsSync(path.join(out, 'hosted')), 'hosted/ must not be published');
});

test('learners can export their progress without sending notes to a server', () => {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.match(html, /Download my course progress/);
  assert.match(html, /JSON\.stringify\(payload, null, 2\)/);
  assert.match(html, /URL\.createObjectURL\(blob\)/);
  assert.match(html, /URL\.revokeObjectURL\(url\)/);
  assert.match(html, /progress: state/);
});
