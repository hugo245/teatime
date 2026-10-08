import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createTeaTimeServer } from '../dist/app.js';

let server;
let base;

before(async () => {
  if (process.env.BASE_URL) {
    base = process.env.BASE_URL;
    return;
  }
  server = createTeaTimeServer({
    databaseFile: ':memory:',
    iceServers: [{ urls: 'stun:stun.example.org:3478' }],
    supportEmail: 'help@example.org',
    adminToken: 'admin-secret',
    ageTestSkip: true,
    minIosBuild: 13,
    hub: { ringTimeoutMs: 400, reconnectGraceMs: 200, rematchCooldownMs: 60_000, rematchWaitMs: 300, matchIntervalMs: 100, offlineRingMs: 600 },
  });
  await new Promise((resolve) => server.http.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.http.address().port}`;
});

after(async () => {
  await server?.close();
});

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function register(name, extra = {}) {
  const res = await api('/api/register', { method: 'POST', body: { name, ...extra } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

function connect(token) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
  const inbox = [];
  const waiters = [];
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const index = waiters.findIndex((w) => w.type === message.type);
    if (index >= 0) {
      const [waiter] = waiters.splice(index, 1);
      waiter.resolve(message);
    } else {
      inbox.push(message);
    }
  });
  const client = {
    ws,
    send: (message) => ws.send(JSON.stringify(message)),
    next(type, timeout = 2000) {
      const index = inbox.findIndex((m) => m.type === type);
      if (index >= 0) return Promise.resolve(inbox.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), timeout);
        waiters.push({
          type,
          resolve: (m) => {
            clearTimeout(timer);
            resolve(m);
          },
        });
      });
    },
    close: () =>
      new Promise((resolve) => {
        if (ws.readyState === WebSocket.CLOSED) return resolve();
        ws.addEventListener('close', () => resolve(), { once: true });
        ws.close();
      }),
  };
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => {
      client.send({ type: 'auth', token });
      client.next('hello').then(() => resolve(client), reject);
    });
    ws.addEventListener('error', reject);
  });
}

describe('profiles', () => {
  test('registers and updates a profile', async () => {
    const { token, user } = await register('Margaret', { location: 'Leeds', interests: ['gardening', 'bogus'] });
    assert.equal(user.name, 'Margaret');
    assert.deepEqual(user.interests, ['gardening']);
    const me = await api('/api/me', { token });
    assert.equal(me.body.user.location, 'Leeds');
    const updated = await api('/api/me', { token, method: 'PATCH', body: { about: 'I love roses', interests: ['music'] } });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.user.about, 'I love roses');
    assert.deepEqual(updated.body.user.interests, ['music']);
  });

  test('rejects invalid names and contact details', async () => {
    const empty = await api('/api/register', { method: 'POST', body: { name: '  ' } });
    assert.equal(empty.status, 400);
    assert.equal(empty.body.field, 'name');
    const { token } = await register('Arthur');
    const phone = await api('/api/me', { token, method: 'PATCH', body: { about: 'Call me on +44 7700 900123' } });
    assert.equal(phone.status, 400);
    const link = await api('/api/me', { token, method: 'PATCH', body: { about: 'visit www.example.com' } });
    assert.equal(link.status, 400);
  });

  test('stores and serves a photo', async () => {
    const { token, user } = await register('Edith');
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
    const res = await api('/api/me/photo', { token, method: 'PUT', body: { data: jpeg.toString('base64') } });
    assert.equal(res.status, 200);
    assert.match(res.body.user.photoUrl, new RegExp(`/api/users/${user.id}/photo\\?v=1`));
    const photo = await fetch(base + res.body.user.photoUrl);
    assert.equal(photo.headers.get('content-type'), 'image/jpeg');
    assert.equal(Buffer.from(await photo.arrayBuffer()).length, jpeg.length);
  });

  test('requires a token', async () => {
    const res = await api('/api/me');
    assert.equal(res.status, 401);
  });

  test('deletes an account', async () => {
    const { token } = await register('Temporary');
    const res = await api('/api/me', { token, method: 'DELETE' });
    assert.equal(res.status, 200);
    const again = await api('/api/me', { token });
    assert.equal(again.status, 401);
  });
});

describe('meeting and calls', () => {
  test('matches two people, relays signals and adds friends', async () => {
    const a = await register('Alice', { interests: ['music', 'travel'] });
    const b = await register('Bob', { interests: ['music'] });
    const alice = await connect(a.token);
    const bob = await connect(b.token);

    alice.send({ type: 'meet.start' });
    await alice.next('meet.searching');
    bob.send({ type: 'meet.start' });
    const startA = await alice.next('call.start');
    const startB = await bob.next('call.start');
    assert.equal(startA.callId, startB.callId);
    assert.equal(startA.peer.name, 'Bob');
    assert.equal(startB.peer.name, 'Alice');
    assert.deepEqual(startA.sharedInterests, ['music']);
    assert.notEqual(startA.initiator, startB.initiator);
    assert.equal(startA.friendship, 'none');

    bob.send({ type: 'signal', callId: startB.callId, data: { type: 'offer', sdp: 'x' } });
    const signal = await alice.next('signal');
    assert.deepEqual(signal.data, { type: 'offer', sdp: 'x' });

    const request = await api(`/api/friends/${b.user.id}`, { token: a.token, method: 'POST' });
    assert.equal(request.body.status, 'requested');
    const incoming = await bob.next('friend.request');
    assert.equal(incoming.user.name, 'Alice');
    const accept = await api(`/api/friends/${a.user.id}`, { token: b.token, method: 'POST' });
    assert.equal(accept.body.status, 'friends');
    await alice.next('friend.added');

    alice.send({ type: 'call.hangup', callId: startA.callId });
    const ended = await bob.next('call.ended');
    assert.equal(ended.reason, 'hangup');

    const friends = await api('/api/friends', { token: a.token });
    assert.equal(friends.body.friends.length, 1);
    assert.equal(friends.body.friends[0].name, 'Bob');
    assert.equal(friends.body.friends[0].online, true);

    await alice.close();
    await bob.close();
  });

  test('cannot add someone you have not met', async () => {
    const a = await register('Stranger');
    const b = await register('Other');
    const res = await api(`/api/friends/${b.user.id}`, { token: a.token, method: 'POST' });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'not-met');
  });

  test('rings a friend who can answer or decline', async () => {
    const a = await register('Caller');
    const b = await register('Callee');
    const caller = await connect(a.token);
    const callee = await connect(b.token);
    caller.send({ type: 'meet.start' });
    await caller.next('meet.searching');
    callee.send({ type: 'meet.start' });
    const first = await caller.next('call.start');
    await callee.next('call.start');
    await api(`/api/friends/${b.user.id}`, { token: a.token, method: 'POST' });
    await api(`/api/friends/${a.user.id}`, { token: b.token, method: 'POST' });
    caller.send({ type: 'call.hangup', callId: first.callId });
    await callee.next('call.ended');

    caller.send({ type: 'call.ring', userId: b.user.id });
    const ringing = await caller.next('call.ringing');
    const incoming = await callee.next('call.incoming');
    assert.equal(incoming.peer.name, 'Caller');
    callee.send({ type: 'call.decline', callId: incoming.callId });
    const declined = await caller.next('call.ended');
    assert.equal(declined.reason, 'declined');
    assert.equal(declined.callId, ringing.callId);

    caller.send({ type: 'call.ring', userId: b.user.id });
    const second = await callee.next('call.incoming');
    await caller.next('call.ringing');
    callee.send({ type: 'call.answer', callId: second.callId });
    const startCaller = await caller.next('call.start');
    const startCallee = await callee.next('call.start');
    assert.equal(startCaller.kind, 'friend');
    assert.equal(startCaller.initiator, true);
    assert.equal(startCallee.initiator, false);
    assert.equal(startCaller.friendship, 'friends');
    callee.send({ type: 'call.hangup', callId: second.callId });
    await caller.next('call.ended');

    caller.send({ type: 'call.ring', userId: b.user.id });
    await callee.next('call.incoming');
    const missed = await caller.next('call.ended', 2000);
    assert.equal(missed.reason, 'no-answer');

    await caller.close();
    await callee.close();
  });

  test('reports end the call, block the pair and ban repeat offenders', async () => {
    const bad = await register('Trouble');
    const badSocket = await connect(bad.token);
    for (const name of ['Rose', 'Iris', 'Daisy']) {
      const good = await register(name);
      const goodSocket = await connect(good.token);
      badSocket.send({ type: 'meet.start' });
      await badSocket.next('meet.searching');
      goodSocket.send({ type: 'meet.start' });
      const start = await goodSocket.next('call.start');
      await badSocket.next('call.start');
      const report = await api('/api/reports', { token: good.token, method: 'POST', body: { userId: bad.user.id, reason: 'money' } });
      assert.equal(report.status, 201);
      if (name !== 'Daisy') {
        const ended = await badSocket.next('call.ended');
        assert.equal(ended.callId, start.callId);
      }
      await goodSocket.close();
    }
    const me = await api('/api/me', { token: bad.token });
    assert.equal(me.status, 403);
    assert.equal(me.body.code, 'banned');
    const reports = await api('/admin/reports', { token: 'admin-secret' });
    assert.equal(reports.body.reports.filter((r) => r.reportedId === bad.user.id).length, 3);
  });

  test('blocked people are never matched', async () => {
    const a = await register('Agnes');
    const b = await register('Bernard');
    const c = await register('Clara');
    const agnes = await connect(a.token);
    const bernard = await connect(b.token);
    agnes.send({ type: 'meet.start' });
    await agnes.next('meet.searching');
    bernard.send({ type: 'meet.start' });
    const start = await agnes.next('call.start');
    await bernard.next('call.start');
    await api(`/api/blocks/${b.user.id}`, { token: a.token, method: 'POST' });
    await bernard.next('call.ended');

    agnes.send({ type: 'meet.start' });
    await agnes.next('meet.searching');
    bernard.send({ type: 'meet.start' });
    await bernard.next('meet.searching');
    const clara = await connect(c.token);
    clara.send({ type: 'meet.start' });
    const claraStart = await clara.next('call.start');
    assert.ok(['Agnes', 'Bernard'].includes(claraStart.peer.name));
    assert.ok(start.callId);
    await agnes.close();
    await bernard.close();
    await clara.close();
  });

  test('matches the same two people again after a short wait', async () => {
    const a = await register('Again');
    const b = await register('Twice');
    const first = await connect(a.token);
    const second = await connect(b.token);
    first.send({ type: 'meet.start' });
    await first.next('meet.searching');
    second.send({ type: 'meet.start' });
    const start = await first.next('call.start');
    await second.next('call.start');
    first.send({ type: 'call.hangup', callId: start.callId });
    await second.next('call.ended');

    first.send({ type: 'meet.start' });
    await first.next('meet.searching');
    second.send({ type: 'meet.start' });
    await second.next('meet.searching');
    const again = await first.next('call.start', 3000);
    assert.notEqual(again.callId, start.callId);
    assert.equal(again.peer.name, 'Twice');
    await second.next('call.start');
    await first.close();
    await second.close();
  });

  test('ends an active call when a person disconnects for good', async () => {
    const a = await register('Leaving');
    const b = await register('Staying');
    const leaving = await connect(a.token);
    const staying = await connect(b.token);
    leaving.send({ type: 'meet.start' });
    await leaving.next('meet.searching');
    staying.send({ type: 'meet.start' });
    await staying.next('call.start');
    await leaving.close();
    await staying.next('peer.reconnecting');
    const ended = await staying.next('call.ended', 2000);
    assert.equal(ended.reason, 'disconnected');
    await staying.close();
  });
});

describe('new features', () => {
  const year = new Date().getUTCFullYear();

  async function meet(a, b, extraA = {}, extraB = {}) {
    a.send({ type: 'meet.start', ...extraA });
    await a.next('meet.searching');
    b.send({ type: 'meet.start', ...extraB });
    return [await a.next('call.start'), await b.next('call.start')];
  }

  test('age check gives the Verified Age badge only when the face matches', async () => {
    const { token } = await register('Beatrice');
    const mismatch = await api('/api/me/age-check', { token, method: 'POST', body: { birthYear: year - 74, estimatedAge: 28, live: true } });
    assert.equal(mismatch.body.verified, false);
    assert.equal(mismatch.body.user.ageVerified, false);
    const child = await api('/api/me/age-check', { token, method: 'POST', body: { birthYear: year - 12, estimatedAge: 12, live: true } });
    assert.equal(child.status, 400);
    const notLive = await api('/api/me/age-check', { token, method: 'POST', body: { birthYear: year - 74, estimatedAge: 70 } });
    assert.equal(notLive.status, 400);
    const ok = await api('/api/me/age-check', { token, method: 'POST', body: { birthYear: year - 74, estimatedAge: 63, live: true } });
    assert.equal(ok.body.verified, true);
    assert.equal(ok.body.user.ageVerified, true);
    assert.equal(ok.body.user.age, 74);
    const hidden = await api('/api/me', { token, method: 'PATCH', body: { showAge: false } });
    assert.equal(hidden.body.user.age, null);
    assert.equal(hidden.body.user.ageVerified, true);
  });

  test('verified only searches skip people without the badge', async () => {
    const v = await register('Vera');
    const u = await register('Ursula');
    const w = await register('Wilma');
    for (const p of [v, w]) {
      await api('/api/me/age-check', { token: p.token, method: 'POST', body: { birthYear: year - 70, estimatedAge: 66, live: true } });
    }
    const vera = await connect(v.token);
    const ursula = await connect(u.token);
    const wilma = await connect(w.token);
    vera.send({ type: 'meet.start', verifiedOnly: true });
    await vera.next('meet.searching');
    ursula.send({ type: 'meet.start' });
    await ursula.next('meet.searching');
    wilma.send({ type: 'meet.start' });
    const start = await wilma.next('call.start');
    assert.equal(start.peer.name, 'Vera');
    assert.equal(start.peer.ageVerified, true);
    await vera.close();
    await ursula.close();
    await wilma.close();
  });

  test('people without a shared language are not matched', async () => {
    const a = await register('Anke', { languages: ['nl'] });
    const b = await register('Bill', { languages: ['en'] });
    const c = await register('Corrie', { languages: ['nl', 'en'] });
    const anke = await connect(a.token);
    const bill = await connect(b.token);
    const corrie = await connect(c.token);
    anke.send({ type: 'meet.start' });
    await anke.next('meet.searching');
    bill.send({ type: 'meet.start' });
    await bill.next('meet.searching');
    corrie.send({ type: 'meet.start' });
    const start = await corrie.next('call.start');
    assert.ok(['Anke', 'Bill'].includes(start.peer.name));
    assert.deepEqual(start.peer.languages, start.peer.name === 'Anke' ? ['nl'] : ['en']);
    await anke.close();
    await bill.close();
    await corrie.close();
  });

  test('relays topics and reactions, shares profiles and counts calls', async () => {
    const a = await register('Elsie', { about: 'I love my roses' });
    const b = await register('Frank');
    const elsie = await connect(a.token);
    const frank = await connect(b.token);
    const [startA] = await meet(elsie, frank);
    elsie.send({ type: 'call.event', callId: startA.callId, event: { kind: 'topic', text: 'What was your first job?', index: 3 } });
    const topic = await frank.next('call.event');
    assert.deepEqual(topic.event, { kind: 'topic', text: 'What was your first job?', index: 3 });
    elsie.send({ type: 'call.event', callId: startA.callId, event: { kind: 'reaction', reaction: 'wave' } });
    assert.equal((await frank.next('call.event')).event.reaction, 'wave');
    elsie.send({ type: 'call.event', callId: startA.callId, event: { kind: 'reaction', reaction: 'evil' } });

    const profile = await api(`/api/users/${a.user.id}`, { token: b.token });
    assert.equal(profile.body.user.about, 'I love my roses');

    await api(`/api/friends/${b.user.id}`, { token: a.token, method: 'POST' });
    await api(`/api/friends/${a.user.id}`, { token: b.token, method: 'POST' });
    const friends = await api('/api/friends', { token: a.token });
    assert.equal(friends.body.friends[0].callCount, 1);
    assert.ok(friends.body.friends[0].lastCallAt > 0);
    elsie.send({ type: 'call.hangup', callId: startA.callId });
    await frank.next('call.ended');
    await elsie.close();
    await frank.close();
  });

  test('profiles of strangers stay private', async () => {
    const a = await register('Private');
    const b = await register('Curious');
    const res = await api(`/api/users/${a.user.id}`, { token: b.token });
    assert.equal(res.status, 404);
  });

  test('serves the age check page', async () => {
    const page = await fetch(base + '/age-check/');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /face-api/);
  });
});

describe('chat, offline calls and events', () => {
  const year = new Date().getUTCFullYear();

  async function friends(nameA, nameB) {
    const a = await register(nameA);
    const b = await register(nameB);
    const sa = await connect(a.token);
    const sb = await connect(b.token);
    sa.send({ type: 'meet.start' });
    await sa.next('meet.searching');
    sb.send({ type: 'meet.start' });
    const start = await sa.next('call.start');
    await sb.next('call.start');
    sa.send({ type: 'call.hangup', callId: start.callId });
    await sb.next('call.ended');
    await api(`/api/friends/${b.user.id}`, { token: a.token, method: 'POST' });
    await api(`/api/friends/${a.user.id}`, { token: b.token, method: 'POST' });
    return { a, b, sa, sb };
  }

  test('friends send messages and read them', async () => {
    const { a, b, sa, sb } = await friends('Writer', 'Reader');
    const sent = await api(`/api/chats/${b.user.id}`, { token: a.token, method: 'POST', body: { text: 'Hello there!\nHow are you?' } });
    assert.equal(sent.status, 201);
    assert.equal(sent.body.message.text, 'Hello there!\nHow are you?');
    const live = await sb.next('chat.message');
    assert.equal(live.message.text, 'Hello there!\nHow are you?');
    assert.equal(live.user.name, 'Writer');

    const list = await api('/api/chats', { token: b.token });
    assert.equal(list.body.unread, 1);
    assert.equal(list.body.chats[0].user.id, a.user.id);
    assert.equal(list.body.chats[0].friend, true);

    const thread = await api(`/api/chats/${a.user.id}`, { token: b.token });
    assert.equal(thread.body.messages.length, 1);
    await api(`/api/chats/${a.user.id}/read`, { token: b.token, method: 'POST' });
    const read = await sa.next('chat.read');
    assert.equal(read.userId, b.user.id);
    assert.equal((await api('/api/chats', { token: b.token })).body.unread, 0);

    const empty = await api(`/api/chats/${b.user.id}`, { token: a.token, method: 'POST', body: { text: '   ' } });
    assert.equal(empty.status, 400);
    const stranger = await register('Stranger');
    const blocked = await api(`/api/chats/${a.user.id}`, { token: stranger.token, method: 'POST', body: { text: 'Hi' } });
    assert.equal(blocked.status, 403);
    await sa.close();
    await sb.close();
  });

  test('rings a friend who is offline and records a missed call', async () => {
    const { a, b, sa, sb } = await friends('Ringer', 'Sleeper');
    await sb.close();
    await new Promise((r) => setTimeout(r, 50));

    sa.send({ type: 'call.ring', userId: b.user.id });
    const ringing = await sa.next('call.ringing');
    assert.equal(ringing.offline, true);
    const back = await connect(b.token);
    const incoming = await back.next('call.incoming');
    assert.equal(incoming.callId, ringing.callId);
    back.send({ type: 'call.answer', callId: incoming.callId });
    await sa.next('call.start');
    await back.next('call.start');
    back.send({ type: 'call.hangup', callId: incoming.callId });
    await sa.next('call.ended');
    await back.close();
    await new Promise((r) => setTimeout(r, 50));

    sa.send({ type: 'call.ring', userId: b.user.id });
    await sa.next('call.ringing');
    const ended = await sa.next('call.ended', 3000);
    assert.equal(ended.reason, 'no-answer');
    const note = await sa.next('chat.message');
    assert.equal(note.message.kind, 'missed-call');
    const chats = await api('/api/chats', { token: b.token });
    assert.equal(chats.body.chats[0].last.kind, 'missed-call');
    assert.equal(chats.body.unread, 1);
    await sa.close();
  });

  test('lists events and lets people say they will come', async () => {
    const { token } = await register('Eventgoer');
    const list = await api('/api/events', { token });
    const test = list.body.events.find((e) => e.title === 'Test');
    assert.ok(test);
    const going = await api(`/api/events/${test.id}/attend`, { token, method: 'POST' });
    assert.equal(going.body.event.attending, true);
    assert.equal(going.body.event.going, test.going + 1);
    const notGoing = await api(`/api/events/${test.id}/attend`, { token, method: 'DELETE' });
    assert.equal(notGoing.body.event.attending, false);

    const created = await fetch(base + '/admin/events', {
      method: 'POST',
      headers: { authorization: 'Bearer admin-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Garden walk', location: 'City park', startsAt: Date.now() + 86400000 }),
    });
    assert.equal(created.status, 201);
    const after = await api('/api/events', { token });
    assert.ok(after.body.events.some((e) => e.title === 'Garden walk'));
  });

  test('the hidden test skip gives the badge without the camera', async () => {
    const { token } = await register('Tester');
    const res = await api('/api/me/age-check', { token, method: 'POST', body: { birthYear: year - 70, test: true } });
    assert.equal(res.body.verified, true);
    assert.equal(res.body.user.age, 70);
    const config = await api('/api/config');
    assert.equal(config.body.ageTestSkip, true);
  });

  test('saves a push token', async () => {
    const { token } = await register('Pushy');
    const res = await api('/api/me/push', { token, method: 'PUT', body: { platform: 'android', token: 'fcm-token-1234567890' } });
    assert.equal(res.body.ok, true);
    assert.equal(res.body.enabled, false);
  });
});

describe('voice messages and planned calls', () => {
  async function friendsPair(nameA, nameB) {
    const a = await register(nameA);
    const b = await register(nameB);
    const sa = await connect(a.token);
    const sb = await connect(b.token);
    sa.send({ type: 'meet.start' });
    await sa.next('meet.searching');
    sb.send({ type: 'meet.start' });
    const start = await sa.next('call.start');
    await sb.next('call.start');
    sa.send({ type: 'call.hangup', callId: start.callId });
    await sb.next('call.ended');
    await api(`/api/friends/${b.user.id}`, { token: a.token, method: 'POST' });
    await api(`/api/friends/${a.user.id}`, { token: b.token, method: 'POST' });
    return { a, b, sa, sb };
  }

  test('sends and plays a voice message', async () => {
    const { a, b, sa, sb } = await friendsPair('Speaker', 'Listener');
    const audio = Buffer.alloc(4000, 7).toString('base64');
    const sent = await api(`/api/chats/${b.user.id}/voice`, { token: a.token, method: 'POST', body: { data: audio, seconds: 5, type: 'audio/mp4' } });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    assert.equal(sent.body.message.kind, 'voice');
    assert.equal(sent.body.message.voice.seconds, 5);
    const live = await sb.next('chat.message');
    assert.equal(live.message.voice.url, sent.body.message.voice.url);
    const file = await fetch(base + sent.body.message.voice.url);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'audio/mp4');
    assert.equal((await file.arrayBuffer()).byteLength, 4000);
    const bad = await api(`/api/chats/${b.user.id}/voice`, { token: a.token, method: 'POST', body: { data: audio, seconds: 5, type: 'text/html' } });
    assert.equal(bad.status, 400);
    await sa.close();
    await sb.close();
  });

  test('plans a call and cancels it', async () => {
    const { a, b, sa, sb } = await friendsPair('Planner', 'Guest');
    const at = Date.now() + 3 * 60 * 60 * 1000;
    const plan = await api(`/api/chats/${b.user.id}/plan`, { token: a.token, method: 'POST', body: { at } });
    assert.equal(plan.status, 201);
    assert.equal(plan.body.message.plan.at, at);
    await sb.next('chat.message');
    const upcoming = await api('/api/plans', { token: b.token });
    assert.equal(upcoming.body.plans.length, 1);
    assert.equal(upcoming.body.plans[0].user.id, a.user.id);
    const past = await api(`/api/chats/${b.user.id}/plan`, { token: a.token, method: 'POST', body: { at: Date.now() - 1000 } });
    assert.equal(past.status, 400);
    const cancel = await api(`/api/plans/${plan.body.message.id}/cancel`, { token: b.token, method: 'POST' });
    assert.equal(cancel.body.message.plan.cancelled, true);
    const update = await sa.next('chat.update');
    assert.equal(update.message.plan.cancelled, true);
    assert.equal((await api('/api/plans', { token: b.token })).body.plans.length, 0);
    await sa.close();
    await sb.close();
  });

  test('events list the people who are coming', async () => {
    const { token, user } = await register('Joiner');
    const list = await api('/api/events', { token });
    const event = list.body.events.find((e) => e.title === 'Test');
    const going = await api(`/api/events/${event.id}/attend`, { token, method: 'POST' });
    assert.ok(going.body.event.people.some((p) => p.id === user.id && p.name === 'Joiner'));
    await api(`/api/events/${event.id}/attend`, { token, method: 'DELETE' });
  });
});

test('reports go to Discord and moderators can warn or remove', { skip: !!process.env.BASE_URL }, async () => {
  const { createServer } = await import('node:http');
  const posts = [];
  const discord = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      posts.push({ url: req.url, body: JSON.parse(body) });
      res.writeHead(204);
      res.end();
    });
  });
  await new Promise((resolve) => discord.listen(0, '127.0.0.1', resolve));
  const own = createTeaTimeServer({
    databaseFile: ':memory:',
    iceServers: [],
    supportEmail: 'help@example.org',
    discordWebhookUrl: `http://127.0.0.1:${discord.address().port}/api/webhooks/1/abc`,
    hub: { matchIntervalMs: 100, rematchWaitMs: 300 },
  });
  await new Promise((resolve) => own.http.listen(0, '127.0.0.1', resolve));
  const ownBase = `http://127.0.0.1:${own.http.address().port}`;
  const call = async (path, { token, method = 'GET', body } = {}) => {
    const res = await fetch(ownBase + path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, text, body: text.startsWith('{') ? JSON.parse(text) : null };
  };
  const socketFor = (token) =>
    new Promise((resolve) => {
      const ws = new WebSocket(ownBase.replace('http', 'ws') + '/ws');
      const inbox = [];
      ws.onmessage = (e) => inbox.push(JSON.parse(e.data));
      ws.onclose = (e) => inbox.push({ type: 'closed', code: e.code });
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', token }));
        setTimeout(() => resolve({ ws, inbox }), 200);
      };
    });
  const until = async (inbox, type) => {
    for (let i = 0; i < 40; i++) {
      const found = inbox.find((m) => m.type === type);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`no ${type}`);
  };
  try {
    const reg = async (name) => (await call('/api/register', { method: 'POST', body: { name } })).body;
    const rose = await reg('Rose Reporter');
    const tom = await reg('Tom Trouble');
    const sr = await socketFor(rose.token);
    const st = await socketFor(tom.token);
    sr.ws.send(JSON.stringify({ type: 'meet.start' }));
    await new Promise((r) => setTimeout(r, 150));
    st.ws.send(JSON.stringify({ type: 'meet.start' }));
    await until(sr.inbox, 'call.start');

    const report = await call('/api/reports', { token: rose.token, method: 'POST', body: { userId: tom.user.id, reason: 'money', source: 'call' } });
    assert.equal(report.status, 201);
    assert.equal(posts.length, 1);
    assert.match(posts[0].url, /with_components=true/);
    const embed = posts[0].body.embeds[0];
    assert.match(embed.title, /Tom Trouble/);
    assert.ok(embed.fields.some((f) => f.value === 'Asked for money or bank details'));
    const buttons = posts[0].body.components[0].components;
    assert.deepEqual(buttons.map((b) => b.label), ['Send a warning', 'Remove account', 'No action', 'Open report']);

    const pageUrl = new URL(embed.url);
    const page = await call(pageUrl.pathname + pageUrl.search);
    assert.equal(page.status, 200);
    assert.match(page.text, /Report about Tom Trouble/);
    const forged = await call(pageUrl.pathname + '?sig=0000');
    assert.equal(forged.status, 404);

    const reportId = pageUrl.pathname.split('/').pop();
    const warned = await call(`/mod/${reportId}/warn${pageUrl.search}`, { method: 'POST' });
    assert.match(warned.text, /A warning was sent/);
    const warning = await until(st.inbox, 'notice');
    assert.equal(warning.notice.kind, 'warning');
    const thanks = await until(sr.inbox, 'notice');
    assert.match(thanks.notice.body, /sent them a warning/);
    assert.ok(posts.some((p) => /A warning was sent/.test(p.body.content ?? '')));

    const later = await socketFor(tom.token);
    const hello = await until(later.inbox, 'hello');
    assert.equal(hello.notices.length, 1);
    await call('/api/notices/seen', { token: tom.token, method: 'POST', body: { ids: [hello.notices[0].id] } });
    const again = await socketFor(tom.token);
    assert.equal((await until(again.inbox, 'hello')).notices.length, 0);

    await call(`/mod/${reportId}/remove${pageUrl.search}`, { method: 'POST' });
    const closed = await until(again.inbox, 'closed');
    assert.equal(closed.code, 4003);
    const me = await call('/api/me', { token: tom.token });
    assert.equal(me.status, 403);
    for (const s of [sr, st, later, again]) s.ws.close();
    await new Promise((r) => setTimeout(r, 300));
  } finally {
    await own.close();
    await new Promise((resolve) => discord.close(resolve));
  }
});

test('old iPhone builds are asked to update and get their account back', async () => {
  const deviceId = 'device-old-build-1234';
  const reg = await register('Olive Old', { deviceId });
  const oldApp = { 'user-agent': 'TeaTime/10 CFNetwork/1568.100.1 Darwin/24.0.0', 'content-type': 'application/json' };
  const newApp = { 'user-agent': 'TeaTime/13 CFNetwork/1568.100.1 Darwin/24.0.0', 'content-type': 'application/json' };

  const blocked = await fetch(base + '/api/me', { headers: { ...oldApp, authorization: `Bearer ${reg.token}` } });
  assert.equal(blocked.status, 401);
  const body = await blocked.json();
  assert.equal(body.code, 'unauthorized');
  assert.match(body.error, /too old/);

  const signup = await fetch(base + '/api/register', { method: 'POST', headers: oldApp, body: JSON.stringify({ name: 'Olive Again' }) });
  assert.equal(signup.status, 426);
  assert.match((await signup.json()).error, /Sideloadly/);

  const fine = await fetch(base + '/api/config', { headers: newApp });
  assert.equal(fine.status, 200);

  const restored = await fetch(base + '/api/restore', { method: 'POST', headers: newApp, body: JSON.stringify({ deviceId }) });
  assert.equal(restored.status, 200);
  const back = await restored.json();
  assert.equal(back.user.id, reg.user.id);
  const me = await fetch(base + '/api/me', { headers: { ...newApp, authorization: `Bearer ${back.token}` } });
  assert.equal((await me.json()).user.name, 'Olive Old');

  const again = await fetch(base + '/api/restore', { method: 'POST', headers: newApp, body: JSON.stringify({ deviceId }) });
  assert.equal(again.status, 404);
});

test('serves config and health', async () => {
  const config = await api('/api/config');
  assert.equal(config.body.iceServers[0].urls, 'stun:stun.example.org:3478');
  const health = await api('/health');
  assert.equal(health.body.ok, true);
});

test('serves app updates from the release files', { skip: !!process.env.BASE_URL }, async () => {
  const { createServer } = await import('node:http');
  const files = {
    '/ota-latest/manifest-android.json': { id: '1d6a3b2e-0000-4000-8000-000000000001', runtimeVersion: '3', launchAsset: { key: 'a' }, assets: [] },
    '/android-latest/version.json': { build: 12, runtimeVersion: '3', url: 'https://example.org/TeaTime.apk' },
  };
  const releases = createServer((req, res) => {
    const file = files[req.url];
    res.writeHead(file ? 200 : 404, { 'content-type': 'application/json' });
    res.end(file ? JSON.stringify(file) : '{}');
  });
  await new Promise((resolve) => releases.listen(0, '127.0.0.1', resolve));
  const own = createTeaTimeServer({
    databaseFile: ':memory:',
    iceServers: [],
    supportEmail: 'help@example.org',
    updates: { releasesUrl: `http://127.0.0.1:${releases.address().port}` },
  });
  await new Promise((resolve) => own.http.listen(0, '127.0.0.1', resolve));
  const ownBase = `http://127.0.0.1:${own.http.address().port}`;
  try {
    const update = await fetch(ownBase + '/api/updates/manifest', {
      headers: { 'expo-platform': 'android', 'expo-runtime-version': '3', 'expo-protocol-version': '1' },
    });
    assert.equal(update.status, 200);
    assert.equal(update.headers.get('expo-protocol-version'), '1');
    assert.match(update.headers.get('content-type'), /^multipart\/mixed; boundary=/);
    const text = await update.text();
    assert.match(text, /name="manifest"/);
    assert.match(text, /1d6a3b2e-0000-4000-8000-000000000001/);

    const older = await fetch(ownBase + '/api/updates/manifest', { headers: { 'expo-platform': 'android', 'expo-runtime-version': '2' } });
    assert.equal(older.status, 204);
    assert.equal(older.headers.get('expo-protocol-version'), '1');

    const missing = await fetch(ownBase + '/api/updates/manifest', { headers: { 'expo-platform': 'ios', 'expo-runtime-version': '3' } });
    assert.equal(missing.status, 204);

    const latest = await (await fetch(ownBase + '/api/app/latest?platform=android')).json();
    assert.deepEqual(latest.latest, { platform: 'android', build: 12, runtimeVersion: '3', url: 'https://example.org/TeaTime.apk' });
    const none = await (await fetch(ownBase + '/api/app/latest?platform=ios')).json();
    assert.equal(none.latest, null);
  } finally {
    await own.close();
    await new Promise((resolve) => releases.close(resolve));
  }
});
