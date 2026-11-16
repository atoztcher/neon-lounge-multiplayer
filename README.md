# Neon Lounge – multiplayer

Không cần tài khoản: nhập tên là vào. Người vào đầu tiên là **host** (👑), chỉ host bật/tắt nhạc và phát YouTube lên màn LED.
Host thoát thì người vào sớm nhất còn lại tự lên host. Mọi người nghe cùng bài (đồng bộ theo giờ server); ai không muốn nghe có thể tắt tiếng riêng.

## Chạy thử trên máy
    npm install
    npm start
Mở http://localhost:3000 (nhiều tab = nhiều người).

## Đưa lên mạng (cần host chạy được Node.js + WebSocket)
Render.com / Railway / Fly.io / VPS đều được:
- Build command: `npm install`
- Start command: `npm start`
- Server tự đọc biến `PORT`, trang có https nên YouTube không báo lỗi 153.

Netlify / GitHub Pages / Vercel (chỉ host file tĩnh) KHÔNG chạy được server.js. Nếu muốn đặt index.html ở đó,
chạy server.js ở chỗ khác rồi mở: `https://trang-cua-shop/?ws=wss://ten-server.onrender.com/ws`

Mở file index.html trực tiếp (file://) thì game chạy chế độ một mình, bạn là host.
