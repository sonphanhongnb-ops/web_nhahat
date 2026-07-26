(function(){
  var reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  /* Nav solidify */
  var head = document.getElementById('head');
  var onScroll = function(){ head.classList.toggle('solid', window.scrollY > 40); };
  onScroll(); window.addEventListener('scroll', onScroll, {passive:true});

  /* Drawer */
  var drawer = document.getElementById('drawer');
  var open = function(){ drawer.classList.add('open'); drawer.setAttribute('aria-hidden','false'); };
  var shut = function(){ drawer.classList.remove('open'); drawer.setAttribute('aria-hidden','true'); };
  document.getElementById('burger').addEventListener('click', open);
  document.getElementById('close').addEventListener('click', shut);
  Array.prototype.forEach.call(drawer.querySelectorAll('a'), function(a){ a.addEventListener('click', shut); });

  /* Reveal on scroll */
  var els = document.querySelectorAll('.reveal');
  if(reduce || !('IntersectionObserver' in window)){
    Array.prototype.forEach.call(els, function(e){ e.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, {threshold:.12, rootMargin:'0px 0px -8% 0px'});
    Array.prototype.forEach.call(els, function(e, i){
      // subtle stagger for grouped items
      e.style.transitionDelay = (Math.min(i%6,5)*60) + 'ms';
      io.observe(e);
    });
  }

  /* ---- Hero faceted "cave vault" (chỉ chạy khi có #facets) ---- */
  var svg = document.getElementById('facets');
  var NS = 'http://www.w3.org/2000/svg';
  function facets(){
    if(!svg) return;
    var w = window.innerWidth, h = window.innerHeight;
    svg.setAttribute('viewBox','0 0 '+w+' '+h);
    while(svg.firstChild) svg.removeChild(svg.firstChild);
    var cols = Math.max(6, Math.round(w/150));
    var rows = 5;                       // chỉ dựng vòm ở phần trên
    var cw = w/cols, ch = (h*0.62)/rows;
    var pts = [];
    for(var y=0;y<=rows;y++){ pts[y]=[]; for(var x=0;x<=cols;x++){
      var jitterX = (x===0||x===cols)?0:(Math.random()-.5)*cw*0.5;
      var jitterY = (y===0)?0:(Math.random()-.5)*ch*0.5;
      pts[y][x] = {x:x*cw+jitterX, y:y*ch+jitterY};
    }}
    function tri(a,b,c,depth){
      var p = document.createElementNS(NS,'polygon');
      p.setAttribute('points', a.x+','+a.y+' '+b.x+','+b.y+' '+c.x+','+c.y);
      // gần đỉnh -> sáng hơn, xuống dưới -> tối dần & mờ dần
      var t = depth/rows;
      var lum = 60 - t*38;                       // độ sáng vàng
      var op = (0.14 - t*0.11) * (0.7 + Math.random()*0.6);
      p.setAttribute('fill','hsl(41 46% '+lum+'%)');
      p.setAttribute('fill-opacity', Math.max(0,op).toFixed(3));
      p.setAttribute('stroke','rgba(201,163,92,'+(0.10 - t*0.08).toFixed(3)+')');
      p.setAttribute('stroke-width','1');
      svg.appendChild(p);
    }
    for(var y=0;y<rows;y++) for(var x=0;x<cols;x++){
      tri(pts[y][x], pts[y][x+1], pts[y+1][x], y);
      tri(pts[y][x+1], pts[y+1][x+1], pts[y+1][x], y);
    }
  }
  facets();
  var rt; window.addEventListener('resize', function(){ clearTimeout(rt); rt=setTimeout(facets,250); });

  /* ---- Vault motif behind SPACE section ---- */
  var vg = document.getElementById('vaultg');
  if(vg){
    for(var i=0;i<40;i++){
      var poly = document.createElementNS(NS,'polygon');
      var x0 = Math.random()*1200, y0 = Math.random()*400;
      var s = 40+Math.random()*90;
      poly.setAttribute('points', x0+','+y0+' '+(x0+s)+','+(y0+s*0.3)+' '+(x0+s*0.4)+','+(y0+s));
      poly.setAttribute('fill','none');
      poly.setAttribute('stroke','rgba(201,163,92,0.06)');
      poly.setAttribute('stroke-width','1');
      vg.appendChild(poly);
    }
  }
})();

/* =========== TIỆN ÍCH CHUNG: bản tin, sao chép liên kết =========== */
(function () {
  /* Đăng ký nhận bản tin ở chân trang */
  var form = document.getElementById('foot-sub');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = document.getElementById('foot-sub-email');
      var msg = document.getElementById('foot-sub-msg');
      var email = input.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        msg.className = 'msg err'; msg.textContent = 'Email chưa hợp lệ.'; return;
      }
      msg.className = 'msg'; msg.textContent = 'Đang gửi…';
      fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, source: 'footer' })
      })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          msg.className = 'msg ' + (j.ok ? 'ok' : 'err');
          msg.textContent = j.ok ? j.message : (j.error || 'Không gửi được.');
          if (j.ok) form.reset();
        })
        .catch(function () { msg.className = 'msg err'; msg.textContent = 'Mất kết nối tới máy chủ.'; });
    });
  }

  /* Sao chép liên kết bài viết */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.copy-link');
    if (!btn) return;
    var url = btn.getAttribute('data-url') || location.href;
    var done = function () {
      var old = btn.textContent;
      btn.textContent = 'Đã sao chép ✓';
      setTimeout(function () { btn.textContent = old; }, 1800);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, done);
    else {
      var t = document.createElement('textarea');
      t.value = url; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch (_e) {}
      document.body.removeChild(t); done();
    }
  });
})();

/* =========== HERO SLIDESHOW (chế độ Slide) =========== */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  var box = document.querySelector('.hero-slides');
  if (!box) return;
  var slides = box.querySelectorAll('.hero-slide');
  if (slides.length < 2 || reduce) return;
  var i = 0, ms = Math.max(2, parseFloat(box.getAttribute('data-interval')) || 5) * 1000;
  setInterval(function () {
    slides[i].classList.remove('on');
    i = (i + 1) % slides.length;
    slides[i].classList.add('on');
  }, ms);
})();
