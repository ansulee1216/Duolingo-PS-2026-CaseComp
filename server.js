import http from 'node:http';
import { randomUUID, randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const clients = new Map();
const duration = Number(process.env.ROUND_SECONDS ?? 180) * 1000;
const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
  iceServers.push({
    urls: process.env.TURN_URL.split(',').map(url => url.trim()),
    username: process.env.TURN_USERNAME,
    credential: process.env.TURN_CREDENTIAL,
  });
}

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/voice.js': ['voice.js', 'text/javascript'],
  '/lily.png': ['lily.png', 'image/png'],
  '/zari.png': ['zari.png', 'image/png'],
};
const send = (client, type, data = {}) => {
  if (client.events.length >= 256) return finish(client, 'dropped');
  client.events.push({ type, ...data });
};
function finish(client, reason) {
  const pair = client.pair;
  if (!pair || pair.ended) return;
  pair.ended = true;
  for (const member of pair.members) {
    member.state = 'ended';
    member.events = [{ type: 'end', reason, reward: Boolean(pair.endsAt) }];
  }
}
function leave(client, reason) {
  finish(client, reason);
  clients.delete(client.id);
}
function sweep() {
  const now = Date.now();
  for (const client of clients.values()) {
    if (client.pair?.endsAt && now >= client.pair.endsAt) finish(client, 'time');
    if (now - client.seen > 10_000) leave(client, 'dropped');
  }
}
setInterval(sweep, 250).unref();

function join(character) {
  sweep();
  const waiting = [...clients.values()].filter(client => client.state === 'waiting');
  const client = { id: randomUUID(), character, seen: Date.now(), state: 'waiting', events: [] };
  clients.set(client.id, client);
  if (waiting.length) {
    const partner = waiting[randomInt(waiting.length)];
    const pair = { members: [partner, client], ready: new Set(), ended: false };
    pair.members.forEach((member, index) => {
      member.state = 'paired';
      member.pair = pair;
      send(member, 'match', { initiator: index === 0, role: index, partner: pair.members[1 - index].character, iceServers });
    });
  }
  return client;
}
async function body(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 32_768) throw Error('Request too large');
  }
  return JSON.parse(data || '{}');
}
function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=()');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const path = new URL(req.url, 'http://localhost').pathname;
  try {
    if (req.method === 'GET' && Object.hasOwn(files, path)) {
      const [name, type] = files[path];
      const contents = await readFile(new URL('./public/' + name, import.meta.url));
      res.writeHead(200, { 'Content-Type': type });
      return res.end(contents);
    }
    if (req.method !== 'POST') return json(res, {}, 404);
    const data = await body(req);
    if (path === '/join' && ['Lily', 'Zari'].includes(data.character)) {
      return json(res, { id: join(data.character).id });
    }
    const client = clients.get(data.id);
    if (!client) return json(res, {}, 410);
    client.seen = Date.now();
    if (path === '/poll') return json(res, { events: client.events.splice(0), now: Date.now() });
    if (path === '/leave') {
      leave(client, data.reason === 'dropped' ? 'dropped' : 'left');
      return json(res, {});
    }
    const pair = client.pair;
    if (!pair || pair.ended) return json(res, {});
    const partner = pair.members.find(member => member !== client);
    if (path === '/signal' && ['description', 'candidate'].includes(data.kind)) {
      send(partner, data.kind, { value: data.value });
    }
    if (path === '/repeat' && pair.endsAt && Date.now() - (client.lastRepeat ?? 0) > 1000) {
      client.lastRepeat = Date.now();
      send(partner, 'repeat');
    }
    if (path === '/ready' && !pair.endsAt) {
      pair.ready.add(client);
      if (pair.ready.size === 2) {
        pair.endsAt = Date.now() + duration;
        pair.members.forEach(member => send(member, 'start', { endsAt: pair.endsAt }));
      }
    }
    json(res, {});
  } catch (error) {
    json(res, {}, error.code === 'ENOENT' ? 404 : 400);
  }
}).listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '127.0.0.1', () => {
  console.log('Character Chat is ready on port ' + (process.env.PORT ?? 3000));
});

