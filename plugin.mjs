import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { eventHandler } from './events.mjs';
import { replyPreview } from './preview.mjs';

const exec = promisify(execFile);
const helper = fileURLToPath(new URL('./OpenCodeNotify.exe', import.meta.url));

export default async function windowsNotifications({ client, directory }) {
  if (process.platform !== 'win32') return {};
  const preview = process.env.OPENCODE_NOTIFY_PREVIEW !== '0';
  async function notify(kind, key, text) {
    const tag = createHash('sha256').update(key).digest('hex').slice(0, 16);
    try {
      const args = process.env.OPENCODE_NOTIFY_QUIET === '1' ? [kind, tag, 'quiet'] : [kind, tag];
      await exec(helper, args, { windowsHide: true, timeout: 6000, env: { ...process.env,
        OPENCODE_NOTIFY_SOURCE_PID: String(process.pid), OPENCODE_NOTIFY_TEXT: preview ? text : '',
      } });
    } catch (error) {
      await client.app.log({ body: { service: 'windows-notify', level: 'warn',
        message: `Windows notification failed (${kind}): ${error.code ?? 'unknown'}` } }).catch(() => {});
    }
  }
  async function isChild(id) {
    try {
      const result = await client.session.get({ path: { id }, query: { directory } });
      return Boolean(result.data?.parentID);
    } catch { return false; }
  }
  async function getReply(id, messageID, promptID) {
    if (!preview) return '';
    try {
      const { data } = await client.session.message({ path: { id, messageID }, query: { directory },
        signal: AbortSignal.timeout(1500) });
      return replyPreview(data, id, messageID, promptID);
    } catch { return ''; } // Missing or late content must never suppress the notification.
  }
  return { event: eventHandler(notify, isChild, getReply) };
}
