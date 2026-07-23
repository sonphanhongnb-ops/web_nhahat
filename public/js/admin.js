/* =========================================================
   SEAPHONY — Kịch bản giao diện quản trị
   ========================================================= */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var csrf = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';

  /* ---------- Menu di động ---------- */
  var burger = $('adm-burger');
  if (burger) {
    burger.addEventListener('click', function () {
      document.querySelector('.adm-side').classList.toggle('open');
    });
  }

  /* ---------- Bỏ dấu tiếng Việt -> slug ---------- */
  function slugify(str) {
    return String(str)
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/['"“”‘’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 90);
  }

  /* =========================================================
     TRÌNH SOẠN THẢO BÀI VIẾT
     ========================================================= */
  var form = $('post-form');
  if (form) {
    var fTitle = $('f-title'), fSlug = $('f-slug'), fContent = $('f-content');
    var fMTitle = $('f-mtitle'), fMDesc = $('f-mdesc'), fKw = $('f-kw');
    var fCover = $('f-cover'), fAlt = $('f-alt');

    /* --- Slug tự động cho bài mới --- */
    var slugTouched = !!fSlug.value;
    fSlug.addEventListener('input', function () { slugTouched = true; });
    fTitle.addEventListener('input', function () {
      if (!slugTouched) fSlug.value = slugify(fTitle.value);
      updatePreview();
    });
    $('btn-slug').addEventListener('click', function () {
      fSlug.value = slugify(fTitle.value); slugTouched = true; updatePreview();
    });

    /* --- Bộ đếm ký tự + xem trước SERP --- */
    function setCounter(el, len, min, max) {
      if (!el) return;
      el.textContent = len + '/' + max;
      el.className = 'counter ' + (len === 0 ? '' : (len < min || len > max ? 'over' : 'good'));
    }
    function highlight(text, kw) {
      if (!kw) return escapeHtml(text);
      try {
        var re = new RegExp('(' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        return escapeHtml(text).replace(re, '<em>$1</em>');
      } catch (_e) { return escapeHtml(text); }
    }
    function escapeHtml(s) {
      return String(s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
    function updatePreview() {
      var title = fMTitle.value || fTitle.value || 'Tiêu đề bài viết';
      var desc = fMDesc.value || 'Mô tả meta sẽ hiển thị ở đây — nên viết 140–160 ký tự có chứa từ khoá chính.';
      $('p-title').textContent = title.length > 60 ? title.slice(0, 60) + '…' : title;
      $('p-desc').innerHTML = highlight(desc.length > 160 ? desc.slice(0, 160) + '…' : desc, fKw.value);
      $('p-slug').textContent = fSlug.value || 'duong-dan';
      setCounter($('c-mtitle'), (fMTitle.value || fTitle.value).length, 30, 60);
      setCounter($('c-mdesc'), fMDesc.value.length, 110, 160);
      var words = fContent.value.replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
      $('c-words').textContent = words + ' từ · ~' + Math.max(1, Math.round(words / 200)) + ' phút đọc';
    }
    [fTitle, fMTitle, fMDesc, fKw, fSlug, fContent].forEach(function (el) {
      el.addEventListener('input', updatePreview);
    });
    updatePreview();

    /* --- Thanh công cụ Markdown --- */
    function insertAt(prefix, suffix) {
      var s = fContent.selectionStart, e = fContent.selectionEnd, v = fContent.value;
      var sel = v.slice(s, e);
      fContent.value = v.slice(0, s) + prefix + sel + (suffix || '') + v.slice(e);
      fContent.focus();
      fContent.selectionStart = s + prefix.length;
      fContent.selectionEnd = s + prefix.length + sel.length;
      updatePreview();
    }
    document.querySelectorAll('.editor-toolbar [data-md]').forEach(function (b) {
      b.addEventListener('click', function () { insertAt(b.getAttribute('data-md').replace(/\\n/g, '\n'), ''); });
    });
    document.querySelectorAll('.editor-toolbar [data-wrap]').forEach(function (b) {
      var w = b.getAttribute('data-wrap');
      b.addEventListener('click', function () { insertAt(w, w); });
    });
    $('btn-link').addEventListener('click', function () {
      var url = prompt('Địa chỉ liên kết:', 'https://');
      if (url) insertAt('[', '](' + url + ')');
    });
    $('btn-img').addEventListener('click', function () {
      var url = prompt('Đường dẫn ảnh (ví dụ /uploads/anh.jpg):', '/uploads/');
      if (!url) return;
      var alt = prompt('Mô tả ảnh (ALT) — bắt buộc để tối ưu SEO ảnh:', '') || '';
      insertAt('\n![' + alt + '](' + url + ')\n', '');
    });

    /* --- Chọn ảnh đại diện --- */
    var picker = $('picker');
    if (picker) {
      picker.addEventListener('click', function (e) {
        var b = e.target.closest('[data-url]');
        if (!b) return;
        fCover.value = b.getAttribute('data-url');
        if (!fAlt.value) fAlt.value = b.getAttribute('data-alt') || '';
        showCover();
      });
    }
    function showCover() {
      var box = $('cover-preview');
      if (fCover.value) { box.style.display = ''; $('cover-img').src = fCover.value; }
      else box.style.display = 'none';
    }
    fCover.addEventListener('input', showCover);

    /* --- Phân tích SEO trực tiếp --- */
    var timer = null;
    function analyze() {
      fetch('/api/seo/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({
          title: fTitle.value, meta_title: fMTitle.value, meta_desc: fMDesc.value,
          focus_keyword: fKw.value, slug: fSlug.value, content: fContent.value,
          cover_image: fCover.value, noindex: $('f-noindex') && $('f-noindex').checked ? 1 : 0
        })
      })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j.ok) return;
          var ring = $('ring');
          ring.style.setProperty('--score', j.score);
          ring.style.setProperty('--ring-color', j.score >= 85 ? 'var(--moss)' : (j.score >= 60 ? 'var(--gold)' : 'var(--rose)'));
          $('ring-num').textContent = j.score;
          $('grade').textContent = j.grade;
          $('stats').textContent = j.stats.words + ' từ · ' + j.stats.readingTime + ' phút đọc · '
            + j.stats.images + ' ảnh · ' + j.stats.internal + ' liên kết nội bộ';
          $('checks').innerHTML = j.checks.map(function (c) {
            return '<li class="' + c.status + '"><span class="dot"></span><span><b>'
              + escapeHtml(c.label) + '</b><small>' + escapeHtml(c.hint) + '</small></span></li>';
          }).join('');
        })
        .catch(function () { /* im lặng — phân tích chỉ là hỗ trợ */ });
    }
    function scheduleAnalyze() { clearTimeout(timer); timer = setTimeout(analyze, 900); }
    [fTitle, fMTitle, fMDesc, fKw, fSlug, fContent, fCover].forEach(function (el) {
      el.addEventListener('input', scheduleAnalyze);
    });
    $('btn-analyze').addEventListener('click', analyze);
    if (fContent.value || fTitle.value) analyze();

    /* --- Cảnh báo rời trang khi chưa lưu --- */
    var dirty = false;
    form.addEventListener('input', function () { dirty = true; });
    form.addEventListener('submit', function () { dirty = false; });
    window.addEventListener('beforeunload', function (e) {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });

    /* --- Ctrl+S để lưu --- */
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); form.submit(); }
    });
  }

  /* =========================================================
     THƯ VIỆN ẢNH — kéo thả
     ========================================================= */
  var drop = $('dropzone');
  if (drop) {
    var input = $('file-input');
    drop.addEventListener('click', function () { input.click(); });
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); });
    });
    drop.addEventListener('drop', function (e) {
      input.files = e.dataTransfer.files;
      $('upload-form').submit();
    });
    input.addEventListener('change', function () {
      if (input.files.length) $('upload-form').submit();
    });
  }

  /* =========================================================
     BIỂU MẪU CHỈNH SỬA NHANH (chuyên mục, thẻ, lịch diễn, người dùng)
     ========================================================= */
  document.querySelectorAll('[data-edit]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var data = JSON.parse(btn.getAttribute('data-edit'));
      var target = document.querySelector(btn.getAttribute('data-form'));
      Object.keys(data).forEach(function (k) {
        var f = target.querySelector('[name="' + k + '"]');
        if (!f) return;
        if (f.type === 'checkbox') f.checked = !!data[k];
        else f.value = data[k] == null ? '' : data[k];
      });
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var first = target.querySelector('input:not([type=hidden])');
      if (first) first.focus();
      var cancel = target.querySelector('.btn-cancel');
      if (cancel) cancel.style.display = '';
    });
  });
  document.querySelectorAll('.btn-cancel').forEach(function (b) {
    b.addEventListener('click', function () {
      var f = b.closest('form');
      f.reset();
      var idf = f.querySelector('[name="id"]');
      if (idf) idf.value = '';
      b.style.display = 'none';
    });
  });

  /* ---------- Xác nhận cho mọi thao tác xoá ---------- */
  document.querySelectorAll('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      if (!confirm(f.getAttribute('data-confirm'))) e.preventDefault();
    });
  });
})();
