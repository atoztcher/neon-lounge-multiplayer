// Neon Lounge - server multiplayer (khong can tai khoan, chi can nhap ten)
// Chay: npm install && npm start   ->  http://localhost:3000
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 40;
const COLORS = [0xff6b9a, 0x7cff6b, 0xb58cff, 0xffe14d, 0x3df0ff, 0xff4fd8, 0x6bd5ff, 0xff7b5c, 0xa0ff3d, 0xc58bff, 0x5cffb8, 0xffb3ec];

const htmlGz = zlib.gzipSync(fs.readFileSync(path.join(__dirname, 'index.html')));
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/' || u === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Encoding': 'gzip', 'Cache-Control': 'no-cache', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    return res.end(htmlGz);
  }
  if (u === '/healthz') { res.writeHead(200); return res.end('ok'); }
  res.writeHead(404); res.end('Not found');
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
const players = new Map();           // id -> player
let nextId = 1, colorIdx = 0, hostId = null;
let music = { mode: 'beat', vid: '', t0: Date.now() };   // mode: beat | off | yt
let lights = true;                                        // den chieu: chung cho ca phong

const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const broadcast = (o, exceptId) => { const s = JSON.stringify(o); for (const p of players.values()) if (p.id !== exceptId && p.ws.readyState === 1) p.ws.send(s); };
const num = (v, lo, hi, d = 0) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : d;
const pub = p => ({ id: p.id, name: p.name, col: p.col, x: p.x, z: p.z, h: p.h, seat: p.seat, mv: p.mv });

function cleanName(raw) {
  let n = String(raw || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  if (!n) n = 'Khách';
  const taken = new Set([...players.values()].map(p => p.name.toLowerCase()));
  taken.add('bạn');
  let out = n, i = 2;
  while (taken.has(out.toLowerCase())) out = n.slice(0, 13) + ' ' + i++;
  return out;
}

function leave(p) {
  if (!players.delete(p.id)) return;
  broadcast({ t: 'leave', id: p.id });
  if (hostId === p.id) {
    const next = players.values().next().value;   // nguoi vao som nhat con lai
    hostId = next ? next.id : null;
    if (next) broadcast({ t: 'host', id: next.id });
  }
  if (!players.size) { music = { mode: 'beat', vid: '', t0: Date.now() }; lights = true; }
}

wss.on('connection', ws => {
  let me = null;
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
        me.stT = me.stT.filter(x => now - x < 1000); if (me.stT.length >= 30) return; me.stT.push(now);
        me.x = num(m.x, -15, 15); me.z = num(m.z, -12, 12); me.h = num(m.h, -10, 10);
        me.seat = Number.isInteger(m.seat) ? Math.max(-1, Math.min(200, m.seat)) : -1; me.mv = m.mv ? 1 : 0;
        broadcast({ t: 's', id: me.id, x: me.x, z: me.z, h: me.h, seat: me.seat, mv: me.mv }, me.id);
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

setInterval(() => wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); }), 30000);
server.listen(PORT, () => console.log('Neon Lounge chay tai http://localhost:' + PORT));
