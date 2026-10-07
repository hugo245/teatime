import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createTeaTimeServer } from '../dist/app.js';

let server;
let base;

before(async () => {
  server = createTeaTimeServer({
    databaseFile: ':memory:',
    iceServers: [{ urls: 'stun:stun.example.org:3478' }],
    supportEmail: 'help@example.org',
    adminToken: 'admin-secret',
    hub: { ringTimeoutMs: 400, reconnectGraceMs: 200, rematchCooldownMs: 60_000, rematchWaitMs: 300, matchIntervalMs: 100 },
  });
  await new Promise((resolve) => server.http.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.http.address().port}`;
});

after(async () => {
  await server.close();
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

test('serves config and health', async () => {
  const config = await api('/api/config');
  assert.equal(config.body.iceServers[0].urls, 'stun:stun.example.org:3478');
  const health = await api('/health');
  assert.equal(health.body.ok, true);
});
