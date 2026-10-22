/* Bộ máy luật Cờ Tướng + AI.
 * Dùng chung cho luồng chính (luật, gợi ý nước đi) và Web Worker (máy suy nghĩ).
 * Luật theo "Luật Cờ Tướng" của Liên đoàn Cờ Việt Nam (QĐ 1409/2004/QĐ-UBTDTT/TT1).
 *
 * Bàn cờ: mảng 90 ô, ô = hàng*9 + cột. Hàng 0 ở trên (bên Đen), hàng 9 ở dưới (bên Trắng).
 * Quân: loại 1..7 = Tướng, Sĩ, Tượng, Mã, Xe, Pháo, Tốt. Trắng = loại, Đen = loại + 8.
 * Nước đi: số nguyên  từ | (đến << 7).
 */
function createEngine() {
  'use strict';

  const K = 1, A = 2, E = 3, H = 4, R = 5, C = 6, P = 7;
  const ROW = new Int8Array(90), COL = new Int8Array(90);
  for (let i = 0; i < 90; i++) { ROW[i] = (i / 9) | 0; COL[i] = i % 9; }
  const sideOf = (p) => p >> 3;
  const typeOf = (p) => p & 7;

  // ---------- Zobrist ----------
  let seed = 0x2545f491;
  function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; }
  const Z1 = new Int32Array(16 * 90), Z2 = new Int32Array(16 * 90);
  for (let i = 0; i < Z1.length; i++) { Z1[i] = rnd(); Z2[i] = rnd(); }
  const ZSIDE = rnd();

  // ---------- Bàn cờ & trạng thái ----------
  function initialBoard() {
    const b = new Int8Array(90);
    const back = [R, H, E, A, K, A, E, H, R];
    for (let c = 0; c < 9; c++) { b[c] = back[c] + 8; b[81 + c] = back[c]; }
    b[2 * 9 + 1] = C + 8; b[2 * 9 + 7] = C + 8;
    b[7 * 9 + 1] = C; b[7 * 9 + 7] = C;
    for (const c of [0, 2, 4, 6, 8]) { b[3 * 9 + c] = P + 8; b[6 * 9 + c] = P; }
    return b;
  }

  function newState(b) {
    const st = { b, kp: [-1, -1], h1: 0, h2: 0 };
    for (let sq = 0; sq < 90; sq++) {
      const p = b[sq];
      if (!p) continue;
      if ((p & 7) === K) st.kp[p >> 3] = sq;
      st.h1 ^= Z1[p * 90 + sq]; st.h2 ^= Z2[p * 90 + sq];
    }
    return st;
  }

  function makeMove(st, mv) {
    const from = mv & 127, to = mv >> 7, b = st.b;
    const p = b[from], cap = b[to];
    b[to] = p; b[from] = 0;
    st.h1 ^= Z1[p * 90 + from] ^ Z1[p * 90 + to];
    st.h2 ^= Z2[p * 90 + from] ^ Z2[p * 90 + to];
    if (cap) { st.h1 ^= Z1[cap * 90 + to]; st.h2 ^= Z2[cap * 90 + to]; }
    if ((p & 7) === K) st.kp[p >> 3] = to;
    return cap;
  }

  function unmakeMove(st, mv, cap) {
    const from = mv & 127, to = mv >> 7, b = st.b;
    const p = b[to];
    b[from] = p; b[to] = cap;
    st.h1 ^= Z1[p * 90 + from] ^ Z1[p * 90 + to];
    st.h2 ^= Z2[p * 90 + from] ^ Z2[p * 90 + to];
    if (cap) { st.h1 ^= Z1[cap * 90 + to]; st.h2 ^= Z2[cap * 90 + to]; }
    if ((p & 7) === K) st.kp[p >> 3] = from;
  }

  function boardKey(b, sd) {
    return String.fromCharCode.apply(null, b) + sd;
  }

  // ---------- Sinh nước đi ----------
  const ORTHR = [1, -1, 0, 0], ORTHC = [0, 0, 1, -1];
  const DIAGR = [1, 1, -1, -1], DIAGC = [1, -1, 1, -1];
  const HORSE = [
    [2, 1, 1, 0], [2, -1, 1, 0], [-2, 1, -1, 0], [-2, -1, -1, 0],
    [1, 2, 0, 1], [-1, 2, 0, 1], [1, -2, 0, -1], [-1, -2, 0, -1],
  ];

  function inPalace(sd, r, c) {
    return c >= 3 && c <= 5 && (sd === 0 ? (r >= 7 && r <= 9) : (r >= 0 && r <= 2));
  }

  function genPseudo(b, sd, capsOnly) {
    const out = [];
    for (let sq = 0; sq < 90; sq++) {
      const p = b[sq];
      if (p === 0 || (p >> 3) !== sd) continue;
      const t = p & 7, r = ROW[sq], c = COL[sq];
      if (t === R) {
        for (let d = 0; d < 4; d++) {
          const dr = ORTHR[d], dc = ORTHC[d];
          let nr = r + dr, nc = c + dc;
          while (nr >= 0 && nr < 10 && nc >= 0 && nc < 9) {
            const to = nr * 9 + nc, q = b[to];
            if (q === 0) { if (!capsOnly) out.push(sq | (to << 7)); }
            else { if ((q >> 3) !== sd) out.push(sq | (to << 7)); break; }
            nr += dr; nc += dc;
          }
        }
      } else if (t === C) {
        for (let d = 0; d < 4; d++) {
          const dr = ORTHR[d], dc = ORTHC[d];
          let nr = r + dr, nc = c + dc, jumped = false;
          while (nr >= 0 && nr < 10 && nc >= 0 && nc < 9) {
            const to = nr * 9 + nc, q = b[to];
            if (!jumped) {
              if (q === 0) { if (!capsOnly) out.push(sq | (to << 7)); }
              else jumped = true;
            } else if (q !== 0) {
              if ((q >> 3) !== sd) out.push(sq | (to << 7));
              break;
            }
            nr += dr; nc += dc;
          }
        }
      } else if (t === H) {
        for (let i = 0; i < 8; i++) {
          const h = HORSE[i];
          const nr = r + h[0], nc = c + h[1];
          if (nr < 0 || nr > 9 || nc < 0 || nc > 8) continue;
          if (b[(r + h[2]) * 9 + (c + h[3])] !== 0) continue; // cản chân mã
          const to = nr * 9 + nc, q = b[to];
          if (q === 0) { if (!capsOnly) out.push(sq | (to << 7)); }
          else if ((q >> 3) !== sd) out.push(sq | (to << 7));
        }
      } else if (t === P) {
        const fwd = sd === 0 ? -1 : 1;
        const crossed = sd === 0 ? r <= 4 : r >= 5;
        let nr = r + fwd;
        if (nr >= 0 && nr <= 9) {
          const to = nr * 9 + c, q = b[to];
          if (q === 0) { if (!capsOnly) out.push(sq | (to << 7)); }
          else if ((q >> 3) !== sd) out.push(sq | (to << 7));
        }
        if (crossed) {
          for (let s = -1; s <= 1; s += 2) {
            const nc = c + s;
            if (nc < 0 || nc > 8) continue;
            const to = r * 9 + nc, q = b[to];
            if (q === 0) { if (!capsOnly) out.push(sq | (to << 7)); }
            else if ((q >> 3) !== sd) out.push(sq | (to << 7));
          }
        }
      } else if (t === K) {
        for (let d = 0; d < 4; d++) {
          const nr = r + ORTHR[d], nc = c + ORTHC[d];
          if (!inPalace(sd, nr, nc)) continue;
          const to = nr * 9 + nc, q = b[to];
          if (q === 0) { if (!capsOnly) out.push(sq | (to << 7)); }
          else if ((q >> 3) !== sd) out.push(sq | (to << 7));
        }
      } else if (t === A) {
        for (let d = 0; d < 4; d++) {
          const nr = r + DIAGR[d], nc = c + DIAGC[d];
          if (!inPalace(sd, nr, nc)) continue;
          const to = nr * 9 + nc, q = b[to];
          if (q === 0) { if (!capsOnly) out.push(sq | (to << 7)); }
          else if ((q >> 3) !== sd) out.push(sq | (to << 7));
        }
      } else if (t === E) {
        for (let d = 0; d < 4; d++) {
          const er = r + DIAGR[d], ec = c + DIAGC[d];
          const nr = r + 2 * DIAGR[d], nc = c + 2 * DIAGC[d];
          if (nr < 0 || nr > 9 || nc < 0 || nc > 8) continue;
          if (sd === 0 ? nr < 5 : nr > 4) continue; // không qua sông
          if (b[er * 9 + ec] !== 0) continue;       // cản mắt tượng
          const to = nr * 9 + nc, q = b[to];
          if (q === 0) { if (!capsOnly) out.push(sq | (to << 7)); }
          else if ((q >> 3) !== sd) out.push(sq | (to << 7));
        }
      }
    }
    return out;
  }

  const HD = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [-1, 2], [1, -2], [-1, -2]];

  /** Tướng của bên `sd` có đang bị chiếu không (kể cả hai tướng đối mặt). */
  function inCheck(st, sd) {
    const b = st.b, g = st.kp[sd], en = 1 - sd, gr = ROW[g], gc = COL[g];
    for (let d = 0; d < 4; d++) {
      const dr = ORTHR[d], dc = ORTHC[d];
      let r = gr + dr, c = gc + dc, screen = false;
      while (r >= 0 && r < 10 && c >= 0 && c < 9) {
        const q = b[r * 9 + c];
        if (q !== 0) {
          if (!screen) {
            if ((q >> 3) === en) {
              const t = q & 7;
              if (t === R || (t === K && dc === 0)) return true;
            }
            screen = true;
          } else {
            if ((q >> 3) === en && (q & 7) === C) return true;
            break;
          }
        }
        r += dr; c += dc;
      }
    }
    const horse = H + en * 8;
    for (let i = 0; i < 8; i++) {
      const hr = gr - HD[i][0], hc = gc - HD[i][1];
      if (hr < 0 || hr > 9 || hc < 0 || hc > 8) continue;
      if (b[hr * 9 + hc] !== horse) continue;
      const lr = hr + (HD[i][0] === 2 ? 1 : HD[i][0] === -2 ? -1 : 0);
      const lc = hc + (HD[i][1] === 2 ? 1 : HD[i][1] === -2 ? -1 : 0);
      if (b[lr * 9 + lc] === 0) return true;
    }
    const pawn = P + en * 8;
    if (en === 0) {
      if (gr + 1 <= 9 && b[(gr + 1) * 9 + gc] === pawn) return true;
      if (gr <= 4) {
        if (gc > 0 && b[gr * 9 + gc - 1] === pawn) return true;
        if (gc < 8 && b[gr * 9 + gc + 1] === pawn) return true;
      }
    } else {
      if (gr - 1 >= 0 && b[(gr - 1) * 9 + gc] === pawn) return true;
      if (gr >= 5) {
        if (gc > 0 && b[gr * 9 + gc - 1] === pawn) return true;
        if (gc < 8 && b[gr * 9 + gc + 1] === pawn) return true;
      }
    }
    return false;
  }

  function genLegal(st, sd, capsOnly) {
    const pm = genPseudo(st.b, sd, capsOnly), out = [];
    for (let i = 0; i < pm.length; i++) {
      const mv = pm[i];
      const cap = makeMove(st, mv);
      if (!inCheck(st, sd)) out.push(mv);
      unmakeMove(st, mv, cap);
    }
    return out;
  }

  // ---------- Ghi nước đi kiểu Việt Nam: "Pháo 2 bình 5" ----------
  const NAMES = ['', 'Tướng', 'Sĩ', 'Tượng', 'Mã', 'Xe', 'Pháo', 'Tốt'];

  function notate(b, mv) {
    const from = mv & 127, to = mv >> 7;
    const p = b[from], sd = p >> 3, t = p & 7;
    const fr = ROW[from], fc = COL[from], tr = ROW[to], tc = COL[to];
    const file = (c) => (sd === 0 ? 9 - c : c + 1);
    // quân cùng loại, cùng bên, cùng cột
    const same = [];
    for (let r = 0; r < 10; r++) {
      const q = b[r * 9 + fc];
      if (q === p) same.push(r);
    }
    let head;
    if (same.length > 1) {
      // thứ tự từ phía đối phương về phía mình
      const order = same.slice().sort((x, y) => (sd === 0 ? x - y : y - x));
      const idx = order.indexOf(fr);
      let label;
      if (order.length === 2) label = idx === 0 ? 'trước' : 'sau';
      else if (order.length === 3) label = ['trước', 'giữa', 'sau'][idx];
      else label = idx === 0 ? 'trước' : idx === order.length - 1 ? 'sau' : 'thứ ' + (idx + 1);
      head = NAMES[t] + ' ' + label;
    } else {
      head = NAMES[t] + ' ' + file(fc);
    }
    let dir, target;
    if (tr === fr) { dir = 'bình'; target = file(tc); }
    else {
      const forward = sd === 0 ? tr < fr : tr > fr;
      dir = forward ? 'tiến' : 'thoái';
      target = (t === H || t === E || t === A) ? file(tc) : Math.abs(tr - fr);
    }
    return head + ' ' + dir + ' ' + target;
  }

  // ---------- Đánh giá ----------
  function pieceScore(p, sq) {
    const sd = p >> 3, t = p & 7, c = COL[sq];
    const r = sd === 0 ? ROW[sq] : 9 - ROW[sq]; // 0 = đáy phía đối phương, 9 = đáy nhà mình
    const cen = 4 - Math.abs(c - 4);
    switch (t) {
      case P:
        if (r <= 4) return 100 + 80 + (4 - r) * 8 + cen * 5;
        return 100 + (6 - r) * 4;
      case H: return 400 + cen * 7 + (9 - r) * 2;
      case C: return 450 + cen * 5 + (c === 4 ? 10 : 0);
      case R: return 900 + (9 - r) * 3 + cen * 2;
      case A: return 200;
      case E: return 200;
      default: return -(9 - r) * 12 - Math.abs(c - 4) * 10; // Tướng nên ở yên giữa cung
    }
  }
  const BASE = [0, 0, 200, 200, 400, 900, 450, 100];

  function evaluate(st, sd) {
    const b = st.b;
    let s = 0;
    for (let sq = 0; sq < 90; sq++) {
      const p = b[sq];
      if (!p) continue;
      const v = pieceScore(p, sq);
      if ((p >> 3) === sd) s += v; else s -= v;
    }
    return s + 8;
  }

  // ---------- Tìm kiếm ----------
  const MATE = 30000, INF = 32000, TIMEOUT = { timeout: true };
  let nodes = 0, deadline = 0;
  let TT = new Map();
  let killers = [];

  function scoreCapture(b, mv) {
    return BASE[b[mv >> 7] & 7] * 10 - BASE[b[mv & 127] & 7] + 1000;
  }

  function orderMoves(st, moves, ttMove, ply) {
    const b = st.b;
    const sc = new Array(moves.length);
    const k = killers[ply];
    for (let i = 0; i < moves.length; i++) {
      const mv = moves[i];
      let s = 0;
      if (mv === ttMove) s = 1e6;
      else if (b[mv >> 7]) s = 1e4 + scoreCapture(b, mv);
      else if (k && (mv === k[0] || mv === k[1])) s = 5000;
      sc[i] = s;
    }
    const idx = moves.map((_, i) => i).sort((x, y) => sc[y] - sc[x]);
    return idx.map((i) => moves[i]);
  }

  function qsearch(st, sd, alpha, beta, qd) {
    nodes++;
    const stand = evaluate(st, sd);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (qd <= 0) return stand;
    const caps = genPseudo(st.b, sd, true);
    caps.sort((x, y) => scoreCapture(st.b, y) - scoreCapture(st.b, x));
    for (let i = 0; i < caps.length; i++) {
      const mv = caps[i];
      const cap = makeMove(st, mv);
      if (inCheck(st, sd)) { unmakeMove(st, mv, cap); continue; }
      const sc = -qsearch(st, 1 - sd, -beta, -alpha, qd - 1);
      unmakeMove(st, mv, cap);
      if (sc >= beta) return sc;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }

  function negamax(st, sd, depth, alpha, beta, ply) {
    nodes++;
    if ((nodes & 2047) === 0 && Date.now() > deadline) throw TIMEOUT;
    const chk = inCheck(st, sd);
    if (chk && ply < 24) depth++;
    if (depth <= 0) return qsearch(st, sd, alpha, beta, 4);

    const key = (st.h1 & 0x1fffff) * 4294967296 + (((sd ? st.h2 ^ ZSIDE : st.h2)) >>> 0);
    const ent = TT.get(key);
    let ttMove = 0;
    if (ent) {
      ttMove = ent.m;
      if (ent.d >= depth) {
        if (ent.f === 0) return ent.s;
        if (ent.f === 1 && ent.s >= beta) return ent.s;
        if (ent.f === 2 && ent.s <= alpha) return ent.s;
      }
    }

    const moves = orderMoves(st, genLegal(st, sd), ttMove, ply);
    if (moves.length === 0) return -(MATE - ply); // hết nước đi là thua
    const a0 = alpha;
    let best = -INF, bestMv = 0;
    for (let i = 0; i < moves.length; i++) {
      const mv = moves[i];
      const cap = makeMove(st, mv);
      const sc = -negamax(st, 1 - sd, depth - 1, -beta, -alpha, ply + 1);
      unmakeMove(st, mv, cap);
      if (sc > best) { best = sc; bestMv = mv; }
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) {
        if (!st.b[mv >> 7]) {
          const k = killers[ply] || (killers[ply] = [0, 0]);
          if (k[0] !== mv) { k[1] = k[0]; k[0] = mv; }
        }
        break;
      }
    }
    if (TT.size > 600000) TT = new Map();
    TT.set(key, { d: depth, s: best, f: best <= a0 ? 2 : best >= beta ? 1 : 0, m: bestMv });
    return best;
  }

  function rootSearch(st, sd, rootMoves, depth, override, exact) {
    let alpha = -INF, bestScore = -INF, bestMv = rootMoves[0];
    const scores = [];
    for (let i = 0; i < rootMoves.length; i++) {
      const mv = rootMoves[i];
      let sc;
      if (override.has(mv)) sc = override.get(mv);
      else {
        const cap = makeMove(st, mv);
        sc = exact
          ? -negamax(st, 1 - sd, depth - 1, -INF, INF, 1)
          : -negamax(st, 1 - sd, depth - 1, -INF, -alpha, 1);
        unmakeMove(st, mv, cap);
      }
      scores.push([mv, sc]);
      if (sc > bestScore) { bestScore = sc; bestMv = mv; if (!exact && sc > alpha) alpha = sc; }
    }
    return { best: bestMv, score: bestScore, scores };
  }

  /**
   * opts: { maxDepth, timeMs, margin, exact, override: [[mv, score], ...] }
   * Trả về { mv, score, depth, nodes } hoặc null nếu hết nước đi.
   */
  function search(board, sd, opts) {
    opts = opts || {};
    const st = newState(Int8Array.from(board));
    nodes = 0; killers = []; TT = new Map();
    deadline = Date.now() + (opts.timeMs || 1000);
    const override = new Map(opts.override || []);
    let rootMoves = genLegal(st, sd);
    if (!rootMoves.length) return null;
    rootMoves = orderMoves(st, rootMoves, 0, 0);
    let best = rootMoves[0], bestScore = 0, doneDepth = 0, scores = null;
    const maxD = opts.maxDepth || 4;
    const exact = !!opts.exact;
    for (let d = 1; d <= maxD; d++) {
      try {
        const res = rootSearch(st, sd, rootMoves, d, override, exact && d === maxD);
        best = res.best; bestScore = res.score; scores = res.scores; doneDepth = d;
        rootMoves = [best].concat(rootMoves.filter((m) => m !== best));
        if (Math.abs(bestScore) > MATE - 100 && !exact) break;
      } catch (e) {
        if (e !== TIMEOUT) throw e;
        break;
      }
    }
    let chosen = best, chosenScore = bestScore;
    if (exact && scores && opts.margin > 0 && doneDepth === maxD) {
      const pool = scores.filter((s) => s[1] >= bestScore - opts.margin);
      const pick = pool[(Math.random() * pool.length) | 0];
      chosen = pick[0]; chosenScore = pick[1];
    }
    return { mv: chosen, score: chosenScore, bestScore, depth: doneDepth, nodes };
  }

  // ---------- Luật chiếu mãi / bắt mãi (Điều 22–24) ----------
  const crossed = (p, r) => ((p >> 3) === 0 ? r <= 4 : r >= 5);

  /**
   * Phân loại nước vừa đi của bên X trên bàn `b` (sau nước đi, đến lượt bên Y).
   * Trả về { check, chased: [id quân bị bắt] }. ids: ô -> mã định danh quân.
   */
  function classify(b, X, ids) {
    const st = newState(Int8Array.from(b));
    const Y = 1 - X;
    if (inCheck(st, Y)) return { check: true, chased: [] };
    const yMoves = genLegal(st, Y);
    const chased = new Set();
    const caps = genLegal(st, X, true);
    for (const mv of caps) {
      const a = mv & 127, t = mv >> 7;
      const pa = st.b[a], pt = st.b[t];
      const ta = pa & 7, tt = pt & 7;
      if (tt === K) continue;
      // Tướng và Tốt bắt mãi chỉ bị xử hòa (Điểm 9) -> không tính là quân đuổi bắt
      if (ta === K || ta === P) continue;
      // Tốt chưa qua sông thì được phép bắt mãi (Điểm 3)
      if (tt === P && !crossed(pt, ROW[t])) continue;
      // Xe-Xe, Pháo-Pháo, Mã-Mã mà bên kia ăn lại được: đòi đổi quân, không phải đuổi bắt (24.20)
      if (ta === tt && (ta === R || ta === C || ta === H)) {
        if (yMoves.some((m) => (m & 127) === t && (m >> 7) === a)) continue;
      }
      // Căn thật: sau khi bị ăn, bên kia thật sự ăn lại được. Căn giả = không ăn lại được.
      const cap = makeMove(st, mv);
      const guarded = genLegal(st, Y, true).some((m) => (m >> 7) === t);
      unmakeMove(st, mv, cap);
      // Mã/Pháo đuổi Xe thì dù có căn thật vẫn là đuổi bắt (Điểm 6)
      if (!guarded || ((ta === H || ta === C) && tt === R)) chased.add(ids[t]);
    }
    return { check: false, chased: Array.from(chased) };
  }

  /**
   * Xét một chu kỳ lặp lại.
   * boards[0..m] là các thế cờ, moves[0..m-1] là các nước đi nối chúng, startSide là bên đi nước đầu.
   * Trả về { viol: [lý do bên Trắng, lý do bên Đen] } với lý do là 'check' | 'chase' | null.
   */
  function judgeCycle(boards, moves, startSide) {
    const ids = new Int16Array(90).fill(-1);
    for (let sq = 0; sq < 90; sq++) if (boards[0][sq]) ids[sq] = sq;
    const rec = [{ checks: [], chased: [] }, { checks: [], chased: [] }];
    for (let i = 0; i < moves.length; i++) {
      const mover = startSide ^ (i & 1);
      const from = moves[i] & 127, to = moves[i] >> 7;
      ids[to] = ids[from]; ids[from] = -1;
      const cls = classify(boards[i + 1], mover, ids);
      rec[mover].checks.push(cls.check);
      rec[mover].chased.push(cls.chased);
    }
    const viol = [null, null];
    for (let x = 0; x < 2; x++) {
      const { checks, chased } = rec[x];
      if (!checks.length) continue;
      if (checks.every(Boolean)) { viol[x] = 'check'; continue; }          // chiếu mãi
      if (checks.some(Boolean)) continue;                                  // một chiếu một bắt/dừng -> hòa
      let common = new Set(chased[0]);
      for (let i = 1; i < chased.length && common.size; i++) {
        const s = new Set(chased[i]);
        common = new Set([...common].filter((v) => s.has(v)));
      }
      if (common.size) viol[x] = 'chase';                                  // đuổi bắt mãi một quân
    }
    return { viol };
  }

  // ---------- FEN (quân Trắng = chữ hoa, Đen = chữ thường, dòng cuối là bên Trắng) ----------
  const FEN_LET = ['', 'k', 'a', 'b', 'n', 'r', 'c', 'p'];
  function toFen(b, sd) {
    const rows = [];
    for (let r = 0; r < 10; r++) {
      let s = '', e = 0;
      for (let c = 0; c < 9; c++) {
        const p = b[r * 9 + c];
        if (!p) { e++; continue; }
        if (e) { s += e; e = 0; }
        const l = FEN_LET[p & 7];
        s += (p >> 3) === 0 ? l.toUpperCase() : l;
      }
      if (e) s += e;
      rows.push(s);
    }
    return rows.join('/') + ' ' + (sd === 0 ? 'w' : 'b');
  }
  function fromFen(fen) {
    const [rows, side] = fen.trim().split(/\s+/);
    const b = new Int8Array(90);
    rows.split('/').forEach((row, r) => {
      let c = 0;
      for (const ch of row) {
        if (ch >= '0' && ch <= '9') { c += +ch; continue; }
        const t = FEN_LET.indexOf(ch.toLowerCase());
        b[r * 9 + c++] = t + (ch === ch.toLowerCase() ? 8 : 0);
      }
    });
    return { board: b, side: side === 'b' ? 1 : 0 };
  }

  // ---------- Bài tập chiếu hết ----------
  /**
   * Các nước đi của bên `att` ép chiếu hết trong n nước. strict = bắt buộc là chiếu bí thật (không tính hết nước đi).
   * n = 1: nước chiếu bí. n = 2: nước đầu tùy ý. n >= 3: các nước ép phải là nước chiếu.
   */
  function mateMoves(st, att, n, strict) {
    const def = 1 - att, out = [];
    const moves = genLegal(st, att);
    for (let i = 0; i < moves.length; i++) {
      const mv = moves[i];
      const cap = makeMove(st, mv);
      let ok = false;
      if (n === 1) ok = (!strict || inCheck(st, def)) && genLegal(st, def).length === 0;
      else if (n === 2 || inCheck(st, def)) {
        const replies = genLegal(st, def);
        if (!replies.length) ok = !strict || inCheck(st, def);
        else {
          ok = true;
          for (let j = 0; j < replies.length && ok; j++) {
            const c2 = makeMove(st, replies[j]);
            ok = mateMoves(st, att, n - 1, strict).length > 0;
            unmakeMove(st, replies[j], c2);
          }
        }
      }
      unmakeMove(st, mv, cap);
      if (ok) out.push(mv);
    }
    return out;
  }

  /** Nước chống đỡ cứng đầu nhất của bên thủ: nước kéo dài việc chiếu hết lâu nhất. */
  function bestDefense(st, att, n) {
    const def = 1 - att;
    const replies = genLegal(st, def);
    let best = replies[0], bestN = -1;
    for (const r of replies) {
      const c = makeMove(st, r);
      let k = 1;
      while (k < n && mateMoves(st, att, k, true).length === 0) k++;
      unmakeMove(st, r, c);
      if (k > bestN) { bestN = k; best = r; }
    }
    return best;
  }

  return {
    K, A, E, H, R, C, P, ROW, COL, NAMES, toFen, fromFen, mateMoves, bestDefense,
    sideOf, typeOf, initialBoard, newState, makeMove, unmakeMove, boardKey,
    genLegal, genPseudo, inCheck, notate, evaluate, search, judgeCycle, classify,
  };
}

if (typeof module !== 'undefined') module.exports = createEngine;
