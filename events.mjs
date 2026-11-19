// One notification per input request or completed main-session turn.
export function eventHandler(notify, isChild) {
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
      await notify(kind, key); return;
    }
    if (/^(question|permission)(\.v2)?\.(replied|rejected)$/.test(t)) {
      s.pending.delete(p.requestID ?? p.permissionID ?? p.id); return;
    }
    if (t === 'session.error') { s.failed = true; s.pending.clear(); return; }
    if ((t === 'message.updated' && p.info?.role === 'user') || t === 'session.next.prompted') {
      s.busy = true; s.failed = false; return;
    }
    if (t === 'session.status' && ['busy', 'retry'].includes(p.status?.type)) {
      if (!s.busy) s.failed = false;
      s.busy = true; return;
    }
    if (t !== 'session.idle' && !(t === 'session.status' && p.status?.type === 'idle')) return;
    if (!s.busy || s.pending.size) return;
    s.busy = false;
    if (s.failed) return;
    if (s.child === undefined) s.child = await isChild(id);
    if (!s.child) await notify('done', `done:${id}`);
  };
}
