// Máy chủ giả lập Firebase (đăng nhập ẩn danh + Realtime Database REST/SSE) để kiểm thử chơi online.
// Dùng chính database.rules.json thông qua targaryen nên luật bảo mật cũng được kiểm tra khi chạy thử.
const http = require('http'), fs = require('fs'), path = require('path');
const targaryen = require('targaryen');
const RULES = JSON.parse(fs.readFileSync(path.join(__dirname, '../database.rules.json'), 'utf8'));

function startMock(port = 0) {
  let db = targaryen.database(RULES, {}, Date.now());
  let seq = 0;
  const subs = new Set();
  const log = [];
  const tree = () => db.root.$value() || {};
  const parts = (p) => String(p).split('/').filter(Boolean);
  const valueAt = (p) => { let v = tree(); for (const k of parts(p)) { if (v && typeof v === 'object' && k in v) v = v[k]; else return null; } return v === undefined ? null : v; };
  const rel = (full, base) => '/' + parts(full).slice(parts(base).length).join('/');
  const isUnder = (child, base) => { const c = parts(child), b = parts(base); return b.length <= c.length && b.every((k, i) => c[i] === k); };

  const send = (res, ev, data) => res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);
  function notify(wPath, kind, payload) {
    for (const s of subs) {
      if (isUnder(wPath, s.path)) {
        if (kind === 'patch') send(s.res, 'patch', { path: rel(wPath, s.path), data: payload });
        else send(s.res, 'put', { path: rel(wPath, s.path), data: valueAt(wPath) });
      } else if (isUnder(s.path, wPath)) send(s.res, 'put', { path: '/', data: valueAt(s.path) });
    }
  }

  function query(val, q) {
    const ob = q.get('orderBy'); if (!ob || !val || typeof val !== 'object') return val;
    const key = JSON.parse(ob);
    let ents = Object.entries(val).filter(([, v]) => v && typeof v === 'object' && key in v).sort((a, b) => (a[1][key] > b[1][key] ? 1 : a[1][key] < b[1][key] ? -1 : 0));
    if (q.get('limitToFirst')) ents = ents.slice(0, +q.get('limitToFirst'));
    if (q.get('limitToLast')) ents = ents.slice(-+q.get('limitToLast'));
    return Object.fromEntries(ents);
  }

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      // ----- đăng nhập -----
      if (u.pathname.endsWith('/v1/accounts:signUp')) {
        const uid = 'u' + (++seq) + Math.random().toString(36).slice(2, 6);
        return json(200, { localId: uid, idToken: 'tok-' + uid, refreshToken: 'ref-' + uid, expiresIn: '3600' });
      }
      if (u.pathname.endsWith('/v1/token')) {
        const rt = new URLSearchParams(body).get('refresh_token') || '';
        if (!rt.startsWith('ref-')) return json(400, { error: { message: 'INVALID_REFRESH_TOKEN' } });
        const uid = rt.slice(4);
        return json(200, { user_id: uid, id_token: 'tok-' + uid, refresh_token: rt, expires_in: '3600' });
      }
      // ----- database -----
      const m = u.pathname.match(/^\/(.*)\.json$/);
      if (!m) return json(404, { error: 'not found' });
      const p = decodeURIComponent(m[1]);
      const tok = u.searchParams.get('auth') || '';
      const auth = tok.startsWith('tok-') ? { uid: tok.slice(4) } : null;
      db = db.with({ now: Date.now() });
      const view = auth ? db.as(auth) : targaryen.database(RULES, db.root.$value() || {}, Date.now());
      const deny = () => json(401, { error: 'Permission denied' });

      if (req.method === 'GET') {
        const r = view.read('/' + p);
        if (!r.allowed) return deny();
        if ((req.headers.accept || '').includes('text/event-stream')) {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
          const s = { path: p, res };
          subs.add(s);
          res.on('close', () => subs.delete(s));
          send(res, 'put', { path: '/', data: valueAt(p) });
          return;
        }
        return json(200, query(valueAt(p), u.searchParams));
      }
      let val = body ? JSON.parse(body) : null;
      let wPath = '/' + p, r, kind = 'put', payload = null;
      if (req.method === 'PUT') r = view.write(wPath, val);
      else if (req.method === 'DELETE') r = view.write(wPath, null);
      else if (req.method === 'POST') { const id = '-M' + Date.now().toString(36) + (++seq); wPath = wPath + '/' + id; r = view.write(wPath, val); }
      else if (req.method === 'PATCH') { r = view.update(wPath, val); kind = 'patch'; payload = val; }
      else return json(405, { error: 'method' });
      log.push({ method: req.method, path: wPath, allowed: r.allowed });
      if (!r.allowed) return deny();
      db = r.newDatabase;
      if (kind === 'patch') {
        // thay .sv bằng giá trị thật khi gửi cho người theo dõi
        const real = {}; for (const k of Object.keys(val)) real[k] = valueAt(wPath + '/' + k);
        notify(wPath, 'patch', real);
      } else notify(wPath, 'put');
      json(200, req.method === 'POST' ? { name: wPath.split('/').pop() } : valueAt(wPath));
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    const url = 'http://127.0.0.1:' + server.address().port;
    resolve({ url, log, dump: () => tree(), close: () => { subs.forEach((s) => s.res.end()); server.close(); }, reset: () => { db = targaryen.database(RULES, {}, Date.now()); } });
  }));
}
module.exports = startMock;
if (require.main === module) startMock(+process.argv[2] || 9099).then((m) => console.log('Máy chủ giả Firebase chạy tại', m.url));
