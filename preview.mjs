import { stripVTControlCharacters } from 'node:util';

// A toast has room for a snippet, not a transcript. Count Unicode code points
// so truncating after Chinese text or emoji never produces an invalid XML char.
export function excerpt(value) {
  if (typeof value !== 'string') return '';
  const text = stripVTControlCharacters(value).replace(/[\p{Cs}\uFFFE\uFFFF]/gu, '')
    .replace(/[\s\p{Cc}]+/gu, ' ').trim();
  const chars = Array.from(text);
  return chars.length > 120 ? chars.slice(0, 119).join('') + '…' : text;
}

export function requestPreview(kind, p) {
  if (kind === 'question') {
    const first = p.questions?.[0];
    return excerpt(first?.question) || excerpt(first?.header);
  }
  return excerpt(p.title) || excerpt(p.metadata?.description) || excerpt(p.action ?? p.permission ?? p.type);
}

export function replyPreview(message, sessionID, messageID, promptID) {
  const info = message?.info;
  if (info?.role !== 'assistant' || info.sessionID !== sessionID || info.id !== messageID ||
      (promptID && info.parentID !== promptID) || info.error || info.summary) return '';
  for (const part of (message.parts ?? []).slice().reverse()) {
    if (part.type !== 'text' || part.synthetic || part.ignored) continue;
    const text = excerpt(part.text);
    if (text) return text;
  }
  return '';
}
