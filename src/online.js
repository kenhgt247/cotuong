/* Lớp mạng cho chơi online: Firebase Realtime Database qua REST + EventSource, đăng nhập ẩn danh.
 * Không dùng thư viện Firebase để game vẫn nhẹ, chạy được offline khi không chơi online.
 * Cấu hình: { apiKey, databaseURL } (xem src/online-config.js). Có thể thêm authURL, tokenURL để thử nghiệm với máy chủ giả.
 */
function createNet(config) {
  'use strict';
  const db = String(config.databaseURL || '').replace(/\/+$/, '');
  const apiKey = String(config.apiKey || '');
  const authURL = String(config.authURL || 'https://identitytoolkit.googleapis.com').replace(/\/+$/, '');
  const tokenURL = String(config.tokenURL || 'https://securetoken.googleapis.com').replace(/\/+$/, '');
  const enabled = !!(db && apiKey);
  const LS = 'cotuong.auth';
  const SV = { '.sv': 'timestamp' };
  let auth = null, offset = 0, authPromise = null;

  async function fetchJSON(url, init) {
    const r = await fetch(url, init);
    const txt = await r.text();
    let j = null;
    try { j = txt ? JSON.parse(txt) : null; } catch (e) { /* không phải JSON */ }
    if (!r.ok) {
      const err = new Error((j && j.error && (j.error.message || j.error)) || ('HTTP ' + r.status));
      err.status = r.status;
      throw err;
    }
    return j;
  }

  // ----- Đăng nhập ẩn danh -----
  function remember() { try { localStorage.setItem(LS, JSON.stringify({ uid: auth.uid, refreshToken: auth.refreshToken })); } catch (e) { /* */ } }
  async function doAuth() {
    const now = Date.now();
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { /* */ }
    const rt = (auth && auth.refreshToken) || (saved && saved.refreshToken);
    if (rt) {
      try {
        const j = await fetchJSON(`${tokenURL}/v1/token?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(rt),
        });
        auth = { uid: j.user_id, idToken: j.id_token, refreshToken: j.refresh_token, exp: now + (+j.expires_in) * 1000 };
        remember();
        return auth;
      } catch (e) { /* hết hạn hoặc bị thu hồi: đăng nhập ẩn danh mới */ }
    }
    const j = await fetchJSON(`${authURL}/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
    });
    auth = { uid: j.localId, idToken: j.idToken, refreshToken: j.refreshToken, exp: now + (+j.expiresIn) * 1000 };
    remember();
    return auth;
  }
  function ensureAuth() {
    if (!enabled) return Promise.reject(new Error('Chưa cấu hình Firebase'));
    if (auth && auth.exp - Date.now() > 90000) return Promise.resolve(auth);
    if (!authPromise) authPromise = doAuth().finally(() => { authPromise = null; });
    return authPromise;
  }

  // ----- Gọi Realtime Database -----
  async function call(method, path, body, query) {
    const a = await ensureAuth();
    const url = `${db}/${path}.json?auth=${encodeURIComponent(a.idToken)}${query ? '&' + query : ''}`;
    const init = { method };
    if (body !== undefined) init.body = JSON.stringify(body);
    return fetchJSON(url, init);
  }
  const get = (p, q) => call('GET', p, undefined, q);
  const put = (p, v) => call('PUT', p, v);
  const patch = (p, v) => call('PATCH', p, v);
  const del = (p) => call('DELETE', p);

  // ----- Cây dữ liệu cục bộ cho luồng sự kiện -----
  function setAt(root, path, val) {
    const parts = String(path).split('/').filter(Boolean);
    if (!parts.length) return val;
    if (!root || typeof root !== 'object') root = {};
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      if (!node[k] || typeof node[k] !== 'object') node[k] = {};
      node = node[k];
    }
    const last = parts[parts.length - 1];
    if (val === null || val === undefined) delete node[last]; else node[last] = val;
    return root;
  }
  function patchAt(root, path, obj) {
    const base = String(path).replace(/\/+$/, '');
    for (const k in obj) root = setAt(root, base + '/' + k, obj[k]);
    return root;
  }

  /** Theo dõi một đường dẫn. h = { onData(cây), onState(s), onError(e) }. Tự nối lại khi mất mạng. */
  function stream(path, h) {
    let es = null, closed = false, cache = null, retry = 0, timer = 0;
    async function open() {
      if (closed) return;
      let a;
      try { a = await ensureAuth(); } catch (e) { if (h.onError) h.onError(e); timer = setTimeout(open, 4000); return; }
      if (closed) return;
      cache = null;
      es = new EventSource(`${db}/${path}.json?auth=${encodeURIComponent(a.idToken)}`);
      es.addEventListener('put', (ev) => { const d = JSON.parse(ev.data); cache = setAt(cache, d.path, d.data); h.onData(cache); });
      es.addEventListener('patch', (ev) => { const d = JSON.parse(ev.data); if (!cache || typeof cache !== 'object') cache = {}; cache = patchAt(cache, d.path, d.data); h.onData(cache); });
      es.addEventListener('auth_revoked', () => { es.close(); open(); });
      es.addEventListener('cancel', () => { if (h.onError) h.onError(new Error('Không có quyền truy cập')); });
      es.onopen = () => { retry = 0; if (h.onState) h.onState('open'); };
      es.onerror = () => {
        if (closed) return;
        es.close();
        if (h.onState) h.onState('reconnecting');
        timer = setTimeout(open, Math.min(8000, 1000 * (++retry)));
      };
    }
    open();
    return { close() { closed = true; clearTimeout(timer); if (es) es.close(); } };
  }

  // ----- Đồng hồ máy chủ -----
  const serverNow = () => Date.now() + offset;
  async function syncClock() {
    const uid = (await ensureAuth()).uid;
    const t0 = Date.now();
    await put(`seen/${uid}`, SV);
    const v = await get(`seen/${uid}`);
    const t1 = Date.now();
    if (typeof v === 'number') offset = v - (t0 + t1) / 2;
    return offset;
  }

  // ----- Hồ sơ công khai (không có họ tên thật) -----
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function genCode() {
    const a = new Uint8Array(6);
    (self.crypto || window.crypto).getRandomValues(a);
    return Array.from(a, (x) => CODE_CHARS[x % CODE_CHARS.length]).join('');
  }
  const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

  async function saveUser(info) { const uid = (await ensureAuth()).uid; await put(`users/${uid}`, info); }
  async function leaderboard() {
    const v = await get('users', 'orderBy="rating"&limitToLast=20');
    return Object.entries(v || {}).map(([uid, u]) => Object.assign({ uid }, u)).sort((x, y) => y.rating - x.rating);
  }

  // ----- Phòng chơi -----
  /** Tạo phòng. side: 0 = Trắng, 1 = Đen. Trả về mã phòng. */
  async function createRoom({ side, clock, info }) {
    const uid = (await ensureAuth()).uid;
    for (let tries = 0; tries < 4; tries++) {
      const code = genCode();
      const data = { clock: clock | 0, created: SV, n: 0, mvs: '', info: { [uid]: info } };
      data[side === 0 ? 'w' : 'b'] = uid;
      try { await put(`rooms/${code}`, data); return code; } catch (e) { if (e.status !== 401 && e.status !== 403) throw e; }
    }
    throw new Error('Không tạo được phòng, hãy thử lại');
  }
  /** Vào phòng. Trả về { code, side } hoặc ném lỗi có .code = 'notfound' | 'full' | 'done'. */
  async function joinRoom(codeIn, info) {
    const code = cleanCode(codeIn);
    const uid = (await ensureAuth()).uid;
    const room = await get(`rooms/${code}`);
    const fail = (c, m) => { const e = new Error(m); e.code = c; throw e; };
    if (!room) fail('notfound', 'Không tìm thấy phòng ' + code);
    if (room.result) fail('done', 'Ván cờ trong phòng này đã kết thúc');
    if (room.w === uid) return { code, side: 0 };
    if (room.b === uid) return { code, side: 1 };
    let slot = null;
    if (!room.w) slot = 'w'; else if (!room.b) slot = 'b';
    if (!slot) fail('full', 'Phòng đã đủ người');
    await patch(`rooms/${code}`, { [slot]: uid, started: SV });
    await put(`rooms/${code}/info/${uid}`, info);
    return { code, side: slot === 'w' ? 0 : 1 };
  }
  async function sendMove(code, n, mvs, mv) {
    const next = mvs ? mvs + ',' + mv : String(mv);
    await patch(`rooms/${code}`, { n: n + 1, mvs: next, lastT: SV });
    return next;
  }
  async function sendResult(code, winner, text) {
    const uid = (await ensureAuth()).uid;
    await put(`rooms/${code}/result`, { w: winner, text: String(text).slice(0, 120), by: uid, t: SV });
  }
  async function sendOffer(code, n) { const uid = (await ensureAuth()).uid; await put(`rooms/${code}/offer`, { from: uid, n }); }
  const clearOffer = (code) => del(`rooms/${code}/offer`);
  async function sendChat(code, k) {
    const uid = (await ensureAuth()).uid;
    await call('POST', `rooms/${code}/chat`, { u: uid, k, t: SV });
  }

  // ----- Ghép nhanh -----
  async function queueJoin(info) { const uid = (await ensureAuth()).uid; await put(`queue/${uid}`, Object.assign({ ts: SV }, info)); }
  async function queueLeave() { const uid = (await ensureAuth()).uid; await del(`queue/${uid}`).catch(() => {}); await del(`claims/${uid}`).catch(() => {}); }
  async function queueScan() {
    const v = await get('queue', 'orderBy="ts"&limitToFirst=20');
    return Object.entries(v || {}).map(([uid, u]) => Object.assign({ uid }, u)).sort((a, b) => a.ts - b.ts);
  }
  async function claim(targetUid, room) { const uid = (await ensureAuth()).uid; await put(`claims/${targetUid}`, { by: uid, room, t: SV }); }

  /** Số người đang online (có nhịp tim trong 90 giây) và số người đang chờ ghép (không tính mình). */
  async function presence() {
    const me = (await ensureAuth()).uid;
    const now = serverNow();
    const [q, seen] = await Promise.all([queueScan(), get('seen', 'orderBy="$value"&startAt=' + Math.floor(now - 90000))]);
    const online = Object.keys(seen || {}).length;
    const waiting = q.filter((e) => e.uid !== me && now - e.ts < 40000).length;
    return { online: Math.max(online, 1), waiting };
  }
  /** Ghi nhận mình có mặt ở khung giờ này (giờ Việt Nam). Mỗi người chỉ có một dấu cho mỗi giờ trong ngày. */
  const vnHour = () => new Date(serverNow() + 7 * 3600000).getUTCHours();
  async function markActive() { const u = (await ensureAuth()).uid; await put(`activity/${vnHour()}/${u}`, SV); return vnHour(); }
  /** Số người khác nhau có mặt ở từng giờ trong 14 ngày gần đây (mảng 24 phần tử). */
  async function peakHours() {
    const v = await get('activity');
    const cutoff = serverNow() - 14 * 86400000;
    const counts = new Array(24).fill(0);
    for (const h of Object.keys(v || {})) for (const u of Object.keys(v[h] || {})) if (v[h][u] >= cutoff && +h >= 0 && +h < 24) counts[+h]++;
    return counts;
  }
  async function heartbeat() { const uid = (await ensureAuth()).uid; await put(`seen/${uid}`, SV); }
  async function uid() { return (await ensureAuth()).uid; }

  return {
    enabled, uid, ensureAuth, get, put, patch, del, stream, syncClock, serverNow, heartbeat, presence, markActive, peakHours, vnHour,
    saveUser, leaderboard, createRoom, joinRoom, sendMove, sendResult, sendOffer, clearOffer, sendChat,
    queueJoin, queueLeave, queueScan, claim, cleanCode, setAt, patchAt,
  };
}
if (typeof module !== 'undefined') module.exports = createNet;
