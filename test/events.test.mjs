import test from 'node:test';
import assert from 'node:assert/strict';
import { eventHandler } from '../events.mjs';

function setup() {
  const sent = [];
  const hook = eventHandler(async (kind, key) => sent.push([kind, key]), async id => id === 'child');
  const emit = (type, properties = {}, sessionID = 'main') => hook({ event: { type, properties: { sessionID, ...properties } } });
  return { emit, kinds: () => sent.map(([kind]) => kind) };
}

test('idle aliases yield one notification per completed main turn', async () => {
  const { emit, kinds } = setup();
  await emit('session.idle');
  for (let i = 0; i < 2; i++) {
    await emit('session.status', { status: { type: 'busy' } });
    await emit('session.status', { status: { type: 'idle' } });
    await emit('session.idle');
  }
  assert.deepEqual(kinds(), ['done', 'done']);
});

test('requests notify once and pending questions do not masquerade as completion', async () => {
  const { emit, kinds } = setup();
  await emit('session.status', { status: { type: 'busy' } });
  await emit('permission.asked', { id: 'p' });
  await emit('permission.v2.asked', { id: 'p' });
  await emit('permission.replied', { requestID: 'p' });
  await emit('question.v2.asked', { id: 'q' });
  await emit('question.asked', { id: 'q' });
  await emit('session.idle');
  assert.deepEqual(kinds(), ['permission', 'question']);
  await emit('question.replied', { requestID: 'q' });
  await emit('session.idle');
  assert.deepEqual(kinds(), ['permission', 'question', 'done']);
});

test('subagent requests are visible but its completion is silent; failed turns are silent', async () => {
  const { emit, kinds } = setup();
  await emit('session.status', { status: { type: 'busy' } }, 'child');
  await emit('permission.updated', { id: 'p' }, 'child');
  await emit('permission.replied', { permissionID: 'p' }, 'child');
  await emit('session.idle', {}, 'child');
  await emit('message.updated', { info: { role: 'user' } });
  await emit('session.error');
  await emit('session.idle');
  assert.deepEqual(kinds(), ['permission']);
});
