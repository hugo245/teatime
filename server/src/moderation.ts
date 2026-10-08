import type { Hub } from './hub.js';
import { toPublicUser, type Message, type ReportDetails, type Store } from './store.js';

const REASON_TEXT: Record<string, string> = {
  rude: 'Rude or unkind',
  inappropriate: 'Inappropriate',
  money: 'Asked for money or bank details',
  fake: 'Fake profile',
  other: 'Something else',
};

const SOURCE_TEXT: Record<string, string> = {
  call: 'During a video call',
  chat: 'In a chat',
  profile: 'From their profile',
};

export type ModerationAction = 'warn' | 'remove' | 'dismiss';

const ACTIONS: Record<ModerationAction, { label: string; done: string }> = {
  warn: { label: 'Send a warning', done: 'A warning was sent.' },
  remove: { label: 'Remove account', done: 'The account was removed.' },
  dismiss: { label: 'No action', done: 'Marked as no action needed.' },
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function clip(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function firstName(name: string) {
  return name.split(' ')[0] || name;
}

function ago(timestamp: number) {
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function reportsText(count: number) {
  return count === 1 ? '1 report in total' : `${count} reports in total`;
}

function messageLine(message: Message, names: Record<string, string>) {
  const who = names[message.from] ?? 'Someone';
  if (message.kind === 'voice') return `${who}: (voice message, ${message.voice?.seconds ?? 0}s)`;
  if (message.kind === 'missed-call') return `${who}: (called)`;
  if (message.kind === 'plan') return `${who}: (planned a call)`;
  return `${who}: ${message.text.replace(/\n/g, ' ')}`;
}

export function createModeration(options: {
  store: Store;
  hub: Hub;
  webhookUrl?: string;
  log: (message: string, extra?: Record<string, unknown>) => void;
}) {
  const { store, hub, log } = options;
  let keyPromise: Promise<CryptoKey> | null = null;

  function key() {
    keyPromise ??= crypto.subtle.importKey('raw', new TextEncoder().encode(store.secret('moderation')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return keyPromise;
  }

  async function sign(reportId: number) {
    const signature = await crypto.subtle.sign('HMAC', await key(), new TextEncoder().encode(`report:${reportId}`));
    return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
  }

  async function verify(reportId: number, sig: string | null) {
    if (!sig) return false;
    const expected = await sign(reportId);
    if (sig.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  }

  async function pageUrl(origin: string, reportId: number, action?: ModerationAction) {
    return `${origin}/mod/${reportId}?sig=${await sign(reportId)}${action ? `&action=${action}` : ''}`;
  }

  function recentMessages(a: string, b: string) {
    return store.conversation(a, b, null, 15);
  }

  async function postToDiscord(body: Record<string, unknown>) {
    const webhook = options.webhookUrl;
    if (!webhook) return;
    const send = (payload: Record<string, unknown>, withComponents: boolean) =>
      fetch(`${webhook}${withComponents ? (webhook.includes('?') ? '&' : '?') + 'with_components=true' : ''}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    try {
      let res = await send(body, true);
      if (!res.ok && body.components) {
        const { components: _unused, ...rest } = body;
        res = await send(rest, false);
      }
      if (!res.ok) log('discord webhook failed', { status: res.status, body: (await res.text()).slice(0, 300) });
    } catch (error) {
      log('discord webhook failed', { error: String(error) });
    }
  }

  async function reportCreated(report: ReportDetails, origin: string, autoRemoved: boolean) {
    if (!options.webhookUrl) return;
    const reported = store.getUser(report.reportedId);
    const reporter = store.getUser(report.reporterId);
    if (!reported || !reporter) return;
    const fields: { name: string; value: string; inline?: boolean }[] = [
      {
        name: 'Reported',
        value: clip(
          `**${reported.name}**${reported.location ? `, ${reported.location}` : ''}\nJoined ${ago(reported.createdAt)}. ${reportsText(store.reportCount(reported.id))}.${reported.ageVerified ? ' Has Verified Age.' : ''}`,
          1000,
        ),
      },
      { name: 'Reported by', value: clip(reporter.name, 200), inline: true },
      { name: 'Reason', value: REASON_TEXT[report.reason] ?? report.reason, inline: true },
      { name: 'Where', value: SOURCE_TEXT[report.source] ?? report.source, inline: true },
    ];
    if (report.details) fields.push({ name: 'Details', value: clip(report.details, 1000) });
    const messages = recentMessages(report.reporterId, report.reportedId);
    if (messages.length) {
      const names = { [reported.id]: firstName(reported.name), [reporter.id]: firstName(reporter.name) };
      fields.push({ name: 'Last messages', value: clip(messages.map((m) => messageLine(m, names)).join('\n'), 1000) });
    }
    if (autoRemoved) fields.push({ name: 'Removed automatically', value: 'Three different people reported this account within a week.' });
    const url = await pageUrl(origin, report.id);
    await postToDiscord({
      username: 'TeaTime reports',
      embeds: [
        {
          title: `New report about ${reported.name}`,
          url,
          color: autoRemoved ? 0x8e2c2c : 0xd9822b,
          fields,
          footer: { text: `Report ${report.id}` },
          timestamp: new Date(report.createdAt).toISOString(),
        },
      ],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 5, label: 'Send a warning', url: await pageUrl(origin, report.id, 'warn') },
            { type: 2, style: 5, label: 'Remove account', url: await pageUrl(origin, report.id, 'remove') },
            { type: 2, style: 5, label: 'No action', url: await pageUrl(origin, report.id, 'dismiss') },
            { type: 2, style: 5, label: 'Open report', url },
          ],
        },
      ],
    });
  }

  function notify(userId: string, kind: string, title: string, body: string) {
    const notice = store.addNotice(userId, kind, title, body);
    hub.send(userId, { type: 'notice', notice });
  }

  async function act(report: ReportDetails, action: ModerationAction) {
    const reported = store.getUser(report.reportedId);
    if (!reported) return;
    const name = firstName(reported.name);
    if (action === 'warn') {
      notify(
        reported.id,
        'warning',
        'A message from the TeaTime team',
        'Someone reported something that happened on TeaTime. Please be kind and follow the community rules. If it happens again, your account may be removed.',
      );
      notify(report.reporterId, 'report', 'Thank you for your report', `We looked at your report about ${name} and sent them a warning.`);
    } else if (action === 'remove') {
      store.setBanned(reported.id, true);
      hub.disconnectUser(reported.id, 4003, 'banned');
      notify(report.reporterId, 'report', 'Thank you for your report', `We looked at your report about ${name} and removed their account. Thank you for helping keep TeaTime safe.`);
    } else {
      notify(
        report.reporterId,
        'report',
        'Thank you for your report',
        `We looked at your report about ${name}. We did not find a rule being broken this time, but they stay blocked for you.`,
      );
    }
    store.setReportAction(report.id, action);
    log('moderation action', { reportId: report.id, action, userId: reported.id });
    await postToDiscord({
      username: 'TeaTime reports',
      content: `Report ${report.id} about ${reported.name}: ${ACTIONS[action].done}`,
    });
  }

  function page(report: ReportDetails, sig: string, origin: string, options: { action?: ModerationAction | null; done?: string }) {
    const reported = store.getUser(report.reportedId);
    const reporter = store.getUser(report.reporterId);
    const name = reported?.name ?? 'Deleted account';
    const names: Record<string, string> = {};
    if (reported) names[reported.id] = firstName(reported.name);
    if (reporter) names[reporter.id] = firstName(reporter.name);
    const messages = reported && reporter ? recentMessages(reporter.id, reported.id) : [];
    const photo = reported ? toPublicUser(reported).photoUrl : null;
    const status = reported?.banned ? 'Removed' : report.action === 'warn' ? 'Warned' : report.action === 'dismiss' ? 'No action taken' : 'Open';
    const button = (action: ModerationAction, style: string) => `
      <form method="post" action="/mod/${report.id}/${action}?sig=${sig}">
        <button class="${style}${options.action === action ? ' picked' : ''}">${ACTIONS[action].label}</button>
      </form>`;
    const row = (label: string, value: string) => `<div class="row"><span>${label}</span><strong>${value}</strong></div>`;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Report ${report.id}</title>
<style>
  body { margin: 0; background: #F7F3EE; color: #1D2621; font: 17px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  main { max-width: 620px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  .muted { color: #5E6A63; }
  .card { background: #fff; border-radius: 16px; padding: 18px; margin-top: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .person { display: flex; gap: 14px; align-items: center; }
  .person img, .person .ph { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; background: #E2EEE6; flex: none; }
  .row { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid #EEE7DD; }
  .row:last-child { border: 0; }
  .row span { color: #5E6A63; }
  .msgs { white-space: pre-wrap; font-size: 15px; background: #F7F3EE; border-radius: 10px; padding: 12px; }
  .actions { display: grid; gap: 10px; margin-top: 16px; }
  button { width: 100%; font: inherit; font-weight: 700; padding: 14px; border-radius: 12px; border: 2px solid transparent; cursor: pointer; }
  .warn { background: #FCEBD5; color: #8A4B08; }
  .remove { background: #B3261E; color: #fff; }
  .dismiss { background: #fff; color: #1D2621; border-color: #D8D0C4; }
  .picked { outline: 4px solid #2E6B4E; outline-offset: 2px; }
  .done { background: #E2EEE6; color: #1F4D37; font-weight: 700; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #EEE7DD; font-size: 14px; font-weight: 700; }
</style>
</head>
<body>
<main>
  <h1>Report about ${escapeHtml(name)}</h1>
  <div class="muted">Report ${report.id}, ${escapeHtml(new Date(report.createdAt).toUTCString())} <span class="badge">${status}</span></div>
  ${options.done ? `<div class="card done">${escapeHtml(options.done)}</div>` : ''}
  ${options.action && !options.done ? `<div class="card">Tap <strong>${ACTIONS[options.action].label}</strong> below to confirm.</div>` : ''}
  <div class="card">
    <div class="person">
      ${photo ? `<img src="${escapeHtml(origin + photo)}" alt="">` : '<div class="ph"></div>'}
      <div>
        <strong>${escapeHtml(name)}</strong><br>
        <span class="muted">${escapeHtml(reported?.location ?? '')}</span>
      </div>
    </div>
    ${reported?.about ? `<p>${escapeHtml(reported.about)}</p>` : ''}
    ${row('Joined', reported ? ago(reported.createdAt) : 'unknown')}
    ${row('Reports in total', String(reported ? store.reportCount(reported.id) : 0))}
    ${row('Verified Age', reported?.ageVerified ? 'Yes' : 'No')}
  </div>
  <div class="card">
    ${row('Reported by', escapeHtml(reporter?.name ?? 'Deleted account'))}
    ${row('Reason', escapeHtml(REASON_TEXT[report.reason] ?? report.reason))}
    ${row('Where', escapeHtml(SOURCE_TEXT[report.source] ?? report.source))}
    ${report.details ? `<p>${escapeHtml(report.details)}</p>` : ''}
  </div>
  ${messages.length ? `<div class="card"><strong>Last messages between them</strong><div class="msgs">${escapeHtml(messages.map((m) => messageLine(m, names)).join('\n'))}</div></div>` : ''}
  ${
    reported && !reported.banned
      ? `<div class="actions">${button('warn', 'warn')}${button('remove', 'remove')}${button('dismiss', 'dismiss')}</div>
         <p class="muted">A warning shows up as a message in their app. Removing the account signs them out for good and blocks their phone from signing up again. The person who reported always gets a short update.</p>`
      : reported?.banned
        ? '<p class="muted">This account has been removed.</p>'
        : ''
  }
</main>
</body>
</html>`;
  }

  return { reportCreated, act, page, verify, actionNames: Object.keys(ACTIONS) as ModerationAction[] };
}

export function isModerationAction(value: string | null | undefined): value is ModerationAction {
  return value === 'warn' || value === 'remove' || value === 'dismiss';
}

export type Moderation = ReturnType<typeof createModeration>;
