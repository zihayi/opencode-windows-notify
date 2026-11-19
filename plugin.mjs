import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { eventHandler } from './events.mjs';

const exec = promisify(execFile);
const helper = fileURLToPath(new URL('./OpenCodeNotify.exe', import.meta.url));

export default async function windowsNotifications({ client, directory }) {
  if (process.platform !== 'win32') return {};
  async function notify(kind, key) {
    const tag = createHash('sha256').update(key).digest('hex').slice(0, 16);
    try {
      const args = process.env.OPENCODE_NOTIFY_QUIET === '1' ? [kind, tag, 'quiet'] : [kind, tag];
      await exec(helper, args, { windowsHide: true, timeout: 6000 });
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
  return { event: eventHandler(notify, isChild) };
}
