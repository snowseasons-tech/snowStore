const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Load the actual browser code without starting its automatic page initialization.
const source = fs.readFileSync(path.join(__dirname, '../static/app.js'), 'utf8')
  .replace(/init\(\);\s*$/, '');

function page(fetch) {
  const elements = {planUsage: {textContent: 'previous usage'}, message: {textContent: ''}};
  const context = vm.createContext({
    fetch,
    localStorage: {getItem: () => null},
    document: {getElementById: id => elements[id]},
  });
  vm.runInContext(source, context);
  return {context, elements};
}

test('account usage loads from the plan API and displays the allowance', async () => {
  const calls = [];
  const {context, elements} = page(async url => {
    calls.push(url);
    return {ok: true, json: async () => ({used: 2, limit: 3})};
  });
  await context.loadPlan();
  assert.deepEqual(calls, ['/api/plan']);
  assert.equal(elements.planUsage.textContent, '2 of 3 accounts used on your plan.');
});

test('unlimited plans clear an earlier account allowance', async () => {
  const {context, elements} = page(async () => ({
    ok: true, json: async () => ({used: 2, limit: 0}),
  }));
  await context.loadPlan();
  assert.equal(elements.planUsage.textContent, '');
});

test('a failed plan request clears stale usage and displays an error', async () => {
  const {context, elements} = page(async () => ({
    ok: false, json: async () => ({detail: 'Session expired'}),
  }));
  await context.loadPlan();
  assert.equal(elements.planUsage.textContent, '');
  assert.equal(elements.message.textContent, 'Could not load account usage: Session expired');
});

test('a network failure is handled without rejecting the background request', async () => {
  const {context, elements} = page(async () => {throw new Error('Network unavailable');});
  await assert.doesNotReject(context.loadPlan());
  assert.equal(elements.planUsage.textContent, '');
  assert.equal(elements.message.textContent, 'Could not load account usage: Network unavailable');
});
