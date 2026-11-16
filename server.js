// Neon Lounge - server multiplayer (khong can tai khoan, chi can nhap ten)
// Chay: npm install && npm start   ->  http://localhost:3000
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 40;
const COLORS = [0xff6b9a, 0x7cff6b, 0xb58cff, 0xffe14d, 0x3df0ff, 0xff4fd8, 0x6bd5ff, 0xff7b5c, 0xa0ff3d, 0xc58bff, 0x5cffb8, 0xffb3ec];

// Nen san 1 lan luc khoi dong (brotli + gzip) + ETag: lan sau trinh duyet chi nhan 304, tiet kiem bang thong
const raw = fs.readFileSync(path.join(__dirname, 'index.html'));
const gz = zlib.gzipSync(raw, { level: 9 });
const br = zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } });
const etag = '"' + require('crypto').createHash('sha1').update(raw).digest('hex').slice(0, 16) + '"';
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/' || u === '/index.html') {
    const h = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ETag: etag, Vary: 'Accept-Encoding', 'Referrer-Policy': 'strict-origin-when-cross-origin' };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, h); return res.end(); }
    const ae = String(req.headers['accept-encoding'] || '');
    let body = raw;
    if (/\bbr\b/.test(ae)) { h['Content-Encoding'] = 'br'; body = br; }
    else if (/\bgzip\b/.test(ae)) { h['Content-Encoding'] = 'gzip'; body = gz; }
    h['Content-Length'] = body.length;
    res.writeHead(200, h);
    return res.end(body);
  }
  if (u === '/healthz') { res.writeHead(200); return res.end('ok'); }
  res.writeHead(404); res.end('Not found');
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048, perMessageDeflate: false, skipUTF8Validation: true });
const players = new Map();           // id -> player
const dirty = new Map();             // id -> player da doi vi tri (gop lai gui 1 goi/tick)
const ipCount = new Map();           // gioi han ket noi / IP
let nextId = 1, colorIdx = 0, hostId = null;
let music = { mode: 'beat', vid: '', t0: Date.now() };   // mode: beat | off | yt
let lights = true;                                        // den chieu: chung cho ca phong

const r2d = v => Math.round(v * 100) / 100;
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const broadcast = (o, exceptId) => { const s = JSON.stringify(o); for (const p of players.values()) if (p.id !== exceptId && p.ws.readyState === 1) p.ws.send(s); };
const num = (v, lo, hi, d = 0) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : d;
const pub = p => ({ id: p.id, name: p.name, col: p.col, x: p.x, z: p.z, h: p.h, seat: p.seat, mv: p.mv });

function cleanName(raw) {
  let n = String(raw || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  if (!n || /^bot\s*\d*$/i.test(n)) n = 'Khách';   // bot1, bot2... danh rieng cho NPC, tranh gia mao
  const taken = new Set([...players.values()].map(p => p.name.toLowerCase()));
  taken.add('bạn');
  let out = n, i = 2;
  while (taken.has(out.toLowerCase())) out = n.slice(0, 13) + ' ' + i++;
  return out;
}

function leave(p) {
  if (!players.delete(p.id)) return;
  dirty.delete(p.id);
  broadcast({ t: 'leave', id: p.id });
  if (hostId === p.id) {
    const next = players.values().next().value;   // nguoi vao som nhat con lai
    hostId = next ? next.id : null;
    if (next) broadcast({ t: 'host', id: next.id });
  }
  if (!players.size) { music = { mode: 'beat', vid: '', t0: Date.now() }; lights = true; }
}

wss.on('connection', (ws, req) => {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
  const n = (ipCount.get(ip) || 0) + 1;
  if (n > 6) return ws.close(1013);          // toi da 6 ket noi / IP
  ipCount.set(ip, n);
  let me = null;
  const joinTimer = setTimeout(() => { if (!me) ws.terminate(); }, 10000);   // khong vao phong trong 10s thi cat
  ws.on('close', () => { clearTimeout(joinTimer); const c = (ipCount.get(ip) || 1) - 1; c ? ipCount.set(ip, c) : ipCount.delete(ip); });
  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;

    if (!me) {                                   // chua vao phong: chi nhan 'join'
      if (m.t !== 'join') return;
      if (players.size >= MAX_PLAYERS) { send(ws, { t: 'err', msg: 'Quán đã đầy, thử lại sau nhé' }); return ws.close(); }
      me = { id: nextId++, ws, name: cleanName(m.name), col: COLORS[colorIdx++ % COLORS.length], x: -1, z: -1, h: 0, seat: -1, mv: 0, chatT: [], stT: [], lgT: [] };
      if (hostId === null) hostId = me.id;       // nguoi dau tien = host
      send(ws, { t: 'welcome', id: me.id, name: me.name, host: hostId, now: Date.now(), music, lights, players: [...players.values()].map(pub) });
      players.set(me.id, me);
      broadcast({ t: 'join', p: pub(me) }, me.id);
      return;
    }

    const now = Date.now();
    switch (m.t) {
      case 's': {                                // vi tri (toi da ~30 goi/giay)
        me.stT = me.stT.filter(x => now - x < 1000); if (me.stT.length >= 15) return; me.stT.push(now);
        me.x = r2d(num(m.x, -15, 15)); me.z = r2d(num(m.z, -12, 12)); me.h = r2d(num(m.h, -10, 10));
        me.seat = Number.isInteger(m.seat) ? Math.max(-1, Math.min(200, m.seat)) : -1; me.mv = m.mv ? 1 : 0;
        dirty.set(me.id, me);               // khong gui ngay: tick 100ms gop tat ca thanh 1 goi
        break;
      }
      case 'chat': {                             // toi da 4 tin / 4 giay
        me.chatT = me.chatT.filter(x => now - x < 4000); if (me.chatT.length >= 4) return; me.chatT.push(now);
        const txt = String(m.txt || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
        if (!txt) return;
        broadcast({ t: 'chat', id: me.id, txt, big: !!m.big && [...txt].length <= 4 }, me.id);
        break;
      }
      case 'lights': {                           // ai cung bat/tat duoc, ca phong cung doi
        me.lgT = me.lgT.filter(x => now - x < 2000); if (me.lgT.length >= 3) return; me.lgT.push(now);
        lights = !!m.on;
        broadcast({ t: 'lights', on: lights, by: me.name });
        break;
      }
      case 'ping': {                             // do lech dong ho client-server (de dong bo nhac/video)
        me.pgT = (me.pgT || []).filter(x => now - x < 10000); if (me.pgT.length >= 12) return; me.pgT.push(now);
        send(ws, { t: 'pong', c: m.c, now });
        break;
      }
      case 'smk': broadcast({ t: 'smk', id: me.id }, me.id); break;
      case 'music': {                            // CHI HOST moi duoc doi nhac
        if (me.id !== hostId) return send(ws, { t: 'err', msg: 'Chỉ host mới được bật nhạc' });
        if (m.mode === 'yt') {
          if (!/^[\w-]{11}$/.test(String(m.vid || ''))) return;
          music = { mode: 'yt', vid: m.vid, t0: now };
        } else if (m.mode === 'beat') music = { mode: 'beat', vid: '', t0: now };
        else if (m.mode === 'off') music = { mode: 'off', vid: '', t0: now };
        else return;
        broadcast({ t: 'music', ...music });
        break;
      }
    }
  });
  ws.on('close', () => { if (me) leave(me); });
  ws.on('error', () => {});
});

// 10 lan/giay: gop moi thay doi vi tri thanh MOT chuoi JSON duy nhat gui cho tat ca (N goi/tick thay vi N*N)
setInterval(() => {
  if (!dirty.size) return;
  const arr = [];
  for (const p of dirty.values()) arr.push([p.id, p.x, p.z, p.h, p.seat, p.mv]);
  dirty.clear();
  if (players.size < 2) return;
  const s = JSON.stringify({ t: 'S', p: arr });
  for (const q of players.values()) if (q.ws.readyState === 1 && q.ws.bufferedAmount < 65536) q.ws.send(s);   // may cham: bo qua goi cu
}, 100);

setInterval(() => wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); }), 30000);
server.listen(PORT, () => console.log('Neon Lounge chay tai http://localhost:' + PORT));
