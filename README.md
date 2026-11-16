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

## Tối ưu / tiết kiệm
- Server gộp vị trí mọi người thành 1 gói/0,1 giây (đo thử 40 người chạy liên tục: ~9,5 KB/s mỗi người, server ~3% 1 core, ~70 MB RAM).
- Trang được nén sẵn (brotli/gzip) + ETag nên lần vào sau chỉ tải lại khi file đổi.
- Giới hạn 40 người, 6 kết nối/IP, chat 4 tin/4 giây – chống spam, đỡ tốn tài nguyên.
- Chọn vùng server gần Việt Nam (Singapore) để ping thấp. Nên đặt uptime ping vào `/healthz` nếu dùng gói miễn phí hay ngủ đông.

## Điện thoại
- Joystick bên trái để đi, kéo màn hình để xoay, chụm 2 ngón để zoom. Màn hình dọc tự mở rộng góc nhìn để thấy đủ quán.
- Nút hành động bên phải thu gọn thành 3 nút tròn (Nhạc / Ngồi / Shisha). Host có thêm nút 📺 để dán link YouTube.
- Khung chat có 3 trạng thái: **mở rộng** (log + emoji + ô nhập), **thu gọn** (1 dòng tin mới nhất, mặc định trên điện thoại) và **ẩn hẳn**
  (bấm 💬 trên cùng để mở lại, có chấm đỏ báo tin mới). Nút ▾/▴ thu gọn/mở rộng, ✕ ẩn. Lựa chọn được nhớ lại cho lần sau.
- Nút 🤖 trong khung chat bật/tắt tin nhắn (cả bong bóng trên đầu) của bot.

## Bot
- 6 NPC được đặt tên bot1 … bot6 (bot1, bot2 là hai DJ). Server không cho người chơi đặt tên "bot", "bot1"… để tránh giả mạo.

## Đồng bộ nhạc / video
- Mọi người dùng chung đồng hồ server (tự đo lại mỗi 20 giây). Server chỉ lưu "video nào, bắt đầu lúc t0"; mỗi máy tự tính vị trí đúng = (giờ server − t0).
- Mỗi giây mỗi máy so giờ video với vị trí đúng: lệch > ~1,2 giây thì tua (có bù độ trễ tua, máy tự học độ trễ này); lệch nhỏ hơn thì chỉnh tốc độ 0,75x/1,25x cho khỏi giật.
- Nếu trình duyệt (iOS/Safari…) chặn tự phát có tiếng, video sẽ chạy tắt tiếng và bật tiếng khi bạn chạm màn hình.
- Video cấm nhúng (lỗi 101/150/153) sẽ báo và host tự quay về nhạc nền.
- Livestream không có độ dài nên không đồng bộ được.
