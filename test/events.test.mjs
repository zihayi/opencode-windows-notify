import test from 'node:test';
import assert from 'node:assert/strict';
import { eventHandler } from '../events.mjs';
import { excerpt, replyPreview } from '../preview.mjs';

function setup(getReply) {
  const sent = [];
  const hook = eventHandler(async (...notification) => sent.push(notification), async id => id === 'child', getReply);
  const emit = (type, properties = {}, sessionID = 'main') => hook({ event: { type, properties: { sessionID, ...properties } } });
  return { emit, kinds: () => sent.map(([kind]) => kind), bodies: () => sent.map(([, , text]) => text) };
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

test('completion uses this turn in this session and never reuses an old reply', async () => {
  const fetched = [];
  const { emit, bodies } = setup(async (...ids) => { fetched.push(ids); return '测试通过'; });
  await emit('message.updated', { info: { role: 'user', id: 'u1' } });
  await emit('message.updated', { info: { role: 'assistant', id: 'a1', parentID: 'u1' } });
  await emit('session.status', { status: { type: 'busy' } }, 'other');
  await emit('session.next.step.started', { assistantMessageID: 'a2' }, 'other');
  await emit('session.next.text.ended', { assistantMessageID: 'a2', text: '另一段对话' }, 'other');
  await emit('session.idle');
  await emit('session.idle', {}, 'other');
  await emit('session.next.prompted', { messageID: 'u3' });
  await emit('message.updated', { info: { role: 'assistant', id: 'a1', parentID: 'u1' } });
  await emit('session.idle');
  assert.deepEqual(fetched, [['main', 'a1', 'u1']]);
  assert.deepEqual(bodies(), ['测试通过', '另一段对话', '']);
});

test('request bodies use the human-facing question or operation, including legacy events', async () => {
  const { emit, bodies } = setup();
  await emit('question.v2.asked', { id: 'q', questions: [{ question: '部署到\n哪个环境？' }] });
  await emit('permission.updated', { id: 'p', title: '读取配置' });
  await emit('permission.v2.asked', { id: 'p2', action: 'edit' });
  await emit('permission.asked', { id: 'p3', permission: 'bash', metadata: { description: '运行测试', command: 'raw' } });
  assert.deepEqual(bodies(), ['部署到 哪个环境？', '读取配置', 'edit', '运行测试']);
});

test('only visible assistant text is used, and previews are bounded XML-safe Unicode', () => {
  const message = { info: { role: 'assistant', sessionID: 's', id: 'a', parentID: 'u' }, parts: [
    { type: 'text', text: 'Working…' }, { type: 'reasoning', text: 'internal' },
    { type: 'text', text: '\x1b[32m结果\x1b[0m <ok> & done\u0000\ud800' },
    { type: 'text', synthetic: true, text: 'internal' }, { type: 'tool', text: 'output' },
  ] };
  assert.equal(replyPreview(message, 's', 'a', 'u'), '结果 <ok> & done');
  assert.equal(replyPreview(message, 's', 'a', 'old'), '');
  assert.equal(replyPreview({ ...message, info: { ...message.info, role: 'user' } }, 's', 'a', 'u'), '');
  assert.equal(excerpt('🚀'.repeat(130)), '🚀'.repeat(119) + '…');
});
