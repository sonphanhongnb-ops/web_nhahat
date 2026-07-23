'use strict';
const express = require('express');
const crypto = require('node:crypto');
const { q, log } = require('../db');
const { shows } = require('../models');
const U = require('../utils');
const SEO = require('../seo');

const router = express.Router();

// ---- Giới hạn tần suất đơn giản theo IP ----
const buckets = new Map();
function rateLimit({ windowMs = 60_000, max = 12 } = {}) {
  return (req, res, next) => {
    const key = `${req.ip}|${req.path}`;
    const now = Date.now();
    const b = buckets.get(key) || { count: 0, reset: now + windowMs };
    if (now > b.reset) { b.count = 0; b.reset = now + windowMs; }
    b.count += 1;
    buckets.set(key, b);
    if (b.count > max) {
      return res.status(429).json({ ok: false, error: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.' });
    }
    return next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
}, 300_000).unref();

function bookingCode() {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 4; i += 1) r += alpha[crypto.randomInt(alpha.length)];
  return `SEA-${r}-${crypto.randomInt(10, 99)}`;
}

// ============================================================
//  ĐẶT VÉ
// ============================================================
router.post('/bookings', rateLimit({ max: 8 }), (req, res) => {
  const { showId, name, email, phone, seats } = req.body || {};
  const show = shows.byId(Number(showId));
  const seatList = Array.isArray(seats) ? seats.slice(0, 8) : [];

  if (!show) return res.status(400).json({ ok: false, error: 'Đêm diễn không tồn tại.' });
  if (!show.on_sale) return res.status(400).json({ ok: false, error: 'Đêm diễn chưa mở bán vé.' });
  if (String(name || '').trim().length < 2) return res.status(400).json({ ok: false, error: 'Vui lòng nhập họ tên.' });
  if (!U.isEmail(email)) return res.status(400).json({ ok: false, error: 'Email chưa hợp lệ.' });
  if (!/^[0-9\s+.]{8,}$/.test(String(phone || ''))) return res.status(400).json({ ok: false, error: 'Số điện thoại chưa hợp lệ.' });
  if (!seatList.length) return res.status(400).json({ ok: false, error: 'Vui lòng chọn ít nhất một ghế.' });

  // Giá tính lại phía máy chủ — không tin dữ liệu từ trình duyệt
  const total = seatList.reduce((t, s) => t + (String(s.zone).toUpperCase() === 'A' ? show.price_a : show.price_b), 0);

  // Không cho trùng ghế đã đặt của cùng đêm diễn
  const booked = new Set();
  for (const r of q.all("SELECT seats FROM bookings WHERE show_id = ? AND status <> 'cancelled'", show.id)) {
    try { for (const s of JSON.parse(r.seats)) booked.add(`${s.zone}-${s.row}${s.num}`); } catch (_e) { /* bỏ qua */ }
  }
  const clash = seatList.filter((s) => booked.has(`${s.zone}-${s.row}${s.num}`));
  if (clash.length) {
    return res.status(409).json({
      ok: false,
      error: `Ghế ${clash.map((s) => `${s.zone}·${s.row}${s.num}`).join(', ')} vừa có người đặt. Vui lòng chọn ghế khác.`,
      taken: clash,
    });
  }

  const code = bookingCode();
  q.run(
    `INSERT INTO bookings(code, show_id, name, email, phone, seats, seat_count, total, status)
     VALUES(?,?,?,?,?,?,?,?,'pending')`,
    code, show.id, String(name).trim().slice(0, 120), String(email).trim().toLowerCase(),
    String(phone).trim().slice(0, 30), JSON.stringify(seatList), seatList.length, total
  );
  log(null, 'booking.create', 'booking', null, `${code} · ${show.title} · ${seatList.length} ghế`, req.ip);

  res.json({
    ok: true,
    code,
    total,
    totalText: U.vnd(total),
    show: { id: show.id, title: show.title, date: show.dateLabel, time: show.show_time },
    message: 'Đặt vé thành công. Chúng tôi sẽ gửi vé điện tử qua email.',
  });
});

/** Ghế đã bán của một đêm diễn — để sơ đồ ghế hiển thị đúng */
router.get('/shows/:id/seats', (req, res) => {
  const show = shows.byId(Number(req.params.id));
  if (!show) return res.status(404).json({ ok: false, error: 'Không tìm thấy đêm diễn.' });
  const taken = [];
  for (const r of q.all("SELECT seats FROM bookings WHERE show_id = ? AND status <> 'cancelled'", show.id)) {
    try { taken.push(...JSON.parse(r.seats).map((s) => `${s.zone}-${s.row}${s.num}`)); } catch (_e) { /* bỏ qua */ }
  }
  res.json({ ok: true, taken });
});

// ============================================================
//  ĐĂNG KÝ NHẬN TIN
// ============================================================
router.post('/subscribe', rateLimit({ max: 10 }), (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!U.isEmail(email)) return res.status(400).json({ ok: false, error: 'Email chưa hợp lệ.' });
  q.run(
    `INSERT INTO subscribers(email, source) VALUES(?, ?)
     ON CONFLICT(email) DO UPDATE SET active = 1`,
    email, String(req.body?.source || 'site').slice(0, 40)
  );
  log(null, 'subscribe', 'subscriber', null, email, req.ip);
  res.json({ ok: true, message: 'Đã đăng ký nhận thông báo. Cảm ơn bạn!' });
});

// ============================================================
//  LIÊN HỆ
// ============================================================
router.post('/contact', rateLimit({ max: 6 }), (req, res) => {
  const { name, email, phone, subject, message, website } = req.body || {};
  if (website) return res.json({ ok: true }); // honeypot chống bot
  if (String(name || '').trim().length < 2) return res.status(400).json({ ok: false, error: 'Vui lòng nhập họ tên.' });
  if (!U.isEmail(email)) return res.status(400).json({ ok: false, error: 'Email chưa hợp lệ.' });
  if (String(message || '').trim().length < 10) return res.status(400).json({ ok: false, error: 'Nội dung quá ngắn.' });

  q.run(
    'INSERT INTO contacts(name, email, phone, subject, message) VALUES(?,?,?,?,?)',
    String(name).trim().slice(0, 120), String(email).trim().toLowerCase(),
    String(phone || '').slice(0, 30), String(subject || '').slice(0, 160), String(message).slice(0, 5000)
  );
  log(null, 'contact.create', 'contact', null, String(email), req.ip);
  res.json({ ok: true, message: 'Đã gửi liên hệ. Chúng tôi sẽ phản hồi sớm nhất.' });
});

// ============================================================
//  PHÂN TÍCH SEO TRỰC TIẾP (cho trình soạn thảo)
// ============================================================
router.post('/seo/analyze', (req, res) => {
  if (!req.user) return res.status(401).json({ ok: false, error: 'Chưa đăng nhập.' });
  const b = req.body || {};
  const html = U.renderContent(b.content || '');
  const result = SEO.analyzePost({
    title: b.title, meta_title: b.meta_title, meta_desc: b.meta_desc,
    focus_keyword: b.focus_keyword, slug: b.slug, content_html: html,
    cover_image: b.cover_image, noindex: Number(b.noindex) ? 1 : 0,
  });
  res.json({ ok: true, ...result });
});

module.exports = router;
