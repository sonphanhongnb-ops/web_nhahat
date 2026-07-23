'use strict';
const express = require('express');
const { q, log } = require('../db');
const A = require('../auth');
const SEO = require('../seo');

const router = express.Router();

function safeNext(v) {
  const s = String(v || '/admin');
  return s.startsWith('/') && !s.startsWith('//') ? s : '/admin';
}

router.get('/dang-nhap', (req, res) => {
  if (req.user) return res.redirect(safeNext(req.query.next));
  res.render('auth/login', {
    error: null,
    email: '',
    next: safeNext(req.query.next),
    seo: SEO.buildMeta({ title: 'Đăng nhập quản trị', path: '/dang-nhap', noindex: true, nofollow: true }),
    jsonLd: [],
  });
});

router.post('/dang-nhap', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const next = safeNext(req.body.next);
  const ip = req.ip || '';

  const fail = (msg) => res.status(401).render('auth/login', {
    error: msg,
    email,
    next,
    seo: SEO.buildMeta({ title: 'Đăng nhập quản trị', path: '/dang-nhap', noindex: true, nofollow: true }),
    jsonLd: [],
  });

  if (!email || !password) return fail('Vui lòng nhập đầy đủ email và mật khẩu.');

  if (A.tooManyAttempts(email, ip)) {
    log(null, 'login.blocked', 'user', null, email, ip);
    return fail('Bạn đã thử sai quá nhiều lần. Vui lòng đợi 15 phút rồi thử lại.');
  }

  const user = q.get('SELECT * FROM users WHERE email = ?', email);
  const ok = user && user.active && A.verifyPassword(password, user.password_hash);
  A.recordAttempt(email, ip, ok);

  if (!ok) {
    log(user?.id || null, 'login.failed', 'user', user?.id || null, email, ip);
    if (user && !user.active) return fail('Tài khoản đã bị vô hiệu hoá. Liên hệ quản trị viên.');
    return fail('Email hoặc mật khẩu không đúng.');
  }

  A.createSession(res, user, req);
  log(user.id, 'login.success', 'user', user.id, '', ip);
  return res.redirect(next);
});

router.post('/dang-xuat', (req, res) => {
  if (req.user) log(req.user.id, 'logout', 'user', req.user.id, '', req.ip);
  A.destroySession(req, res);
  res.redirect('/dang-nhap');
});

// Cho phép đăng xuất bằng liên kết GET (tiện dụng), vẫn xoá phiên phía máy chủ
router.get('/dang-xuat', (req, res) => {
  if (req.user) log(req.user.id, 'logout', 'user', req.user.id, '', req.ip);
  A.destroySession(req, res);
  res.redirect('/dang-nhap');
});

module.exports = router;
