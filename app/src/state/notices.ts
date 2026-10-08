import { api, type Notice } from '../lib/api';
import { realtime } from '../lib/realtime';
import { alertMessage } from './ui';

const shown = new Set<number>();
let queue: Notice[] = [];
let showing = false;

async function showNext() {
  if (showing) return;
  const notice = queue.shift();
  if (!notice) return;
  showing = true;
  await alertMessage(notice.title, notice.body);
  await api.seenNotices([notice.id]).catch(() => null);
  showing = false;
  void showNext();
}

function add(notices: Notice[]) {
  for (const notice of notices) {
    if (shown.has(notice.id)) continue;
    shown.add(notice.id);
    queue.push(notice);
  }
  void showNext();
}

export function resetNotices() {
  queue = [];
  shown.clear();
}

realtime.subscribe((message) => {
  if (message.type === 'hello' && Array.isArray(message.notices)) add(message.notices as Notice[]);
  if (message.type === 'notice' && message.notice) add([message.notice as Notice]);
});
