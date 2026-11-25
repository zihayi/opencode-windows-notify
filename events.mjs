import { excerpt, requestPreview } from './preview.mjs';

// One notification per input request or completed main-session turn.
export function eventHandler(notify, isChild, getReply = async () => '') {
  const sessions = new Map();
  const requests = new Map();
  const ask = new Map([
    ['permission.asked', 'permission'], ['permission.v2.asked', 'permission'],
    ['permission.updated', 'permission'], ['question.asked', 'question'], ['question.v2.asked', 'question'],
  ]);
  function state(id) {
    if (!sessions.has(id)) {
      if (sessions.size >= 256) sessions.delete(sessions.keys().next().value);
      sessions.set(id, { busy: false, failed: false, child: undefined, pending: new Set() });
    }
    return sessions.get(id);
  }
  return async ({ event }) => {
    if (!event) return;
    const t = event.type, p = event.properties || {};
    const id = p.sessionID ?? p.info?.sessionID ?? (t.startsWith('session.') ? p.info?.id : undefined);
    if (!id) return;
    if (t === 'session.deleted') { sessions.delete(id); return; }
    const s = state(id);
    if (t === 'session.created' || t === 'session.updated') {
      if (p.info) s.child = Boolean(p.info.parentID);
      return;
    }
    const kind = ask.get(t);
    if (kind) {
      const req = p.id ?? p.requestID ?? p.tool?.callID ?? event.id;
      if (!req) return;
      const key = `${kind}:${id}:${req}`;
      if (requests.has(key)) return;
      if (requests.size >= 512) requests.delete(requests.keys().next().value);
      requests.set(key, true); s.pending.add(req);
      await notify(kind, key, requestPreview(kind, p)); return;
    }
    if (/^(question|permission)(\.v2)?\.(replied|rejected)$/.test(t)) {
      s.pending.delete(p.requestID ?? p.permissionID ?? p.id); return;
    }
    if (t === 'session.error') { s.failed = true; s.pending.clear(); return; }
    if ((t === 'message.updated' && p.info?.role === 'user') || t === 'session.next.prompted') {
      const prompt = p.messageID ?? p.info?.id;
      if (!s.busy || prompt !== s.prompt) s.reply = undefined;
      s.prompt = prompt;
      s.busy = true; s.failed = false; return;
    }
    if (s.busy && t === 'message.updated' && p.info?.role === 'assistant' && !p.info.summary &&
        (!s.prompt || s.prompt === p.info.parentID)) {
      if (s.reply?.id !== p.info.id) s.reply = { id: p.info.id };
      return;
    }
    if (s.busy && t === 'session.next.step.started') {
      if (s.reply?.id !== p.assistantMessageID) s.reply = { id: p.assistantMessageID };
      return;
    }
    if (s.busy && t === 'session.next.text.ended' && s.reply && s.reply.id === p.assistantMessageID) {
      s.reply.text = excerpt(p.text); return;
    }
    if (t === 'session.status' && ['busy', 'retry'].includes(p.status?.type)) {
      if (!s.busy) s.failed = false;
      s.busy = true; return;
    }
    if (t !== 'session.idle' && !(t === 'session.status' && p.status?.type === 'idle')) return;
    if (!s.busy || s.pending.size) return;
    s.busy = false;
    const { reply, prompt } = s;
    s.reply = s.prompt = undefined;
    if (s.failed) return;
    if (s.child === undefined) s.child = await isChild(id);
    if (!s.child) {
      const text = reply?.text || (reply?.id ? await getReply(id, reply.id, prompt) : '');
      await notify('done', `done:${id}`, text);
    }
  };
}
