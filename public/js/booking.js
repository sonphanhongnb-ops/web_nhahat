/* =========== ĐẶT VÉ ONLINE — dữ liệu & xác nhận từ máy chủ =========== */
(function(){
  var el = function(id){ return document.getElementById(id); };
  var modal = el('booking'); if(!modal) return;
  var lastFocus = null;

  var EN = document.documentElement.lang === 'en';
  var T = {
    title_book:  EN ? 'Reserve seats'   : 'Đặt vé',
    title_pick:  EN ? 'Choose a performance' : 'Chọn đêm diễn',
    title_seat:  EN ? 'Choose your seats'    : 'Chọn ghế',
    title_form:  EN ? 'Your details'         : 'Thông tin đặt vé',
    title_done:  EN ? 'Confirmed'            : 'Hoàn tất',
    title_notify:EN ? 'Get notified'         : 'Nhận thông báo mở bán',
    steps:       EN ? ['Performance','Seats','Details','Done'] : ['Đêm diễn','Chọn ghế','Thông tin','Hoàn tất'],
    stage:       EN ? 'Stage' : 'Sân khấu',
    free:        EN ? 'Available' : 'Còn trống',
    sel:         EN ? 'Selected'  : 'Đang chọn',
    taken:       EN ? 'Sold'      : 'Đã bán',
    onsale:      EN ? 'On sale'   : 'Còn vé',
    soon:        EN ? 'Coming soon' : 'Sắp mở bán',
    venue:       EN ? 'Alluvium Center' : 'Trung tâm Alluvium',
    hint_seat:   EN ? 'Tap a seat to select or deselect · up to 8 per booking.' : 'Nhấp vào ghế để chọn hoặc bỏ chọn · tối đa 8 vé mỗi lượt.',
    none_sel:    EN ? 'No seats selected yet.' : 'Chưa chọn ghế nào.',
    max:         EN ? 'Up to 8 tickets per booking.' : 'Tối đa 8 vé mỗi lượt đặt.',
    name:        EN ? 'Full name' : 'Họ và tên',
    phone:       EN ? 'Phone number' : 'Số điện thoại',
    show_lbl:    EN ? 'Performance' : 'Đêm diễn',
    time_lbl:    EN ? 'Time' : 'Thời gian',
    seats_lbl:   EN ? 'Seats' : 'Ghế',
    total:       EN ? 'Total' : 'Tổng',
    total_pay:   EN ? 'Total' : 'Tổng thanh toán',
    back:        EN ? 'Back' : 'Quay lại',
    cont:        EN ? 'Continue' : 'Tiếp tục',
    confirm:     EN ? 'Confirm' : 'Xác nhận đặt vé',
    sending:     EN ? 'Sending…' : 'Đang gửi…',
    again:       EN ? 'Book again' : 'Đặt vé khác',
    close:       EN ? 'Close' : 'Đóng',
    done_h:      EN ? 'Booking confirmed' : 'Đặt vé thành công',
    thanks:      EN ? 'Thank you' : 'Cảm ơn',
    tix_for:     EN ? 'E-tickets for the show on' : 'Vé điện tử cho suất',
    tix_to:      EN ? 'will be sent to' : 'sẽ được gửi tới',
    note_done:   EN ? 'Your booking is recorded. We will contact you to confirm before issuing e-tickets.'
                    : 'Đơn đã được ghi nhận. Chúng tôi sẽ liên hệ xác nhận trước khi phát hành vé điện tử.',
    notify_p:    EN ? 'This performance will open for sale soon. Leave your email to be notified.'
                    : 'Đêm diễn này sẽ mở bán trong thời gian tới. Để lại email để nhận thông báo.',
    subscribe:   EN ? 'Subscribe' : 'Đăng ký',
    subscribed_h:EN ? 'Subscribed' : 'Đã đăng ký',
    subscribed_p:function(em){ return EN ? ('We will notify ' + em + ' as soon as tickets open.')
                                         : ('Chúng tôi sẽ gửi thông báo tới ' + em + ' ngay khi vé mở bán.'); },
    e_name:      EN ? 'Please enter your name' : 'Vui lòng nhập họ tên',
    e_email:     EN ? 'Invalid email' : 'Email chưa hợp lệ',
    e_phone:     EN ? 'Invalid phone number' : 'Số điện thoại chưa hợp lệ',
    e_submit:    EN ? 'Could not submit, please try again.' : 'Không gửi được đơn, vui lòng thử lại.',
    e_conn:      EN ? 'Lost connection to server. Please try again.' : 'Mất kết nối tới máy chủ. Vui lòng thử lại.'
  };

  /* Lịch diễn do máy chủ đưa xuống (xem views/partials/end.ejs) */
  var SHOWS = (window.__SEAPHONY_SHOWS__ || []).map(function(s){
    return {id:s.id, d:s.d, m:s.m, title:s.title, time:s.time, onsale:!!s.onsale,
            priceA:s.priceA || 600000, priceB:s.priceB || 400000};
  });

  var ZONES = {
    A : {name:(EN?'Tier A':'Khán đài A'),  label:(EN?'Central · premium':'Trung tâm · Hạng nhất'), price:600000, rows:'ABCDEF', cols:15},
    B1: {name:(EN?'Tier B1':'Khán đài B1'), label:(EN?'Left':'Bên trái'),               price:400000, rows:'ABCDE',  cols:10},
    B2: {name:(EN?'Tier B2':'Khán đài B2'), label:(EN?'Right':'Bên phải'),               price:400000, rows:'ABCDE',  cols:10}
  };
  var ZONE_ORDER = ['B1','A','B2'];
  var MAX = 8;

  var state = null;

  function vnd(n){ return EN ? ('VND ' + n.toLocaleString('en-US')) : (n.toLocaleString('vi-VN') + 'đ'); }
  function keys(){ return Object.keys(state.selected); }
  function total(){ return keys().reduce(function(t,k){ return t + state.selected[k].price; },0); }

  function applyPrices(si){
    var s = SHOWS[si]; if(!s) return;
    ZONES.A.price = s.priceA; ZONES.B1.price = s.priceB; ZONES.B2.price = s.priceB;
  }

  /* Ghế đã bán — lấy thật từ máy chủ */
  var takenCache = {};
  function takenSet(si, zk){
    var s = SHOWS[si]; if(!s) return {};
    var byShow = takenCache[s.id] || {};
    var set = {};
    Object.keys(byShow).forEach(function(id){
      var p = id.split('-');           // ví dụ "A-B7" hoặc "B1-C3"
      if(p[0] === zk) set[p[1]] = true;
    });
    return set;
  }
  function loadTaken(si, done){
    var s = SHOWS[si]; if(!s) return done();
    if(takenCache[s.id]) return done();
    fetch('/api/shows/' + s.id + '/seats')
      .then(function(r){ return r.json(); })
      .then(function(j){
        var map = {};
        (j.taken || []).forEach(function(id){ map[id] = true; });
        takenCache[s.id] = map;
        done();
      })
      .catch(function(){ takenCache[s.id] = {}; done(); });
  }

  /* ---------- OPEN / CLOSE ---------- */
  function openBooking(si){
    state = {mode:'book', step:1, showIndex:null, zone:'A', selected:{}, buyer:null, code:null, sending:false};
    if(si!=null && SHOWS[si]){
      if(SHOWS[si].onsale){ state.showIndex=si; state.step=2; applyPrices(si); }
      else { state.mode='notify'; state.showIndex=si; }
    }
    lastFocus = document.activeElement;
    modal.classList.add('open'); modal.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
    document.addEventListener('keydown', onKey);
    if(state.step===2){ loadTaken(state.showIndex, render); } else { render(); }
    var c = modal.querySelector('.modal-close'); if(c) c.focus();
  }
  function closeBooking(){
    modal.classList.remove('open'); modal.setAttribute('aria-hidden','true');
    document.body.style.overflow='';
    document.removeEventListener('keydown', onKey);
    if(lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onKey(e){
    if(e.key==='Escape'){ closeBooking(); return; }
    if(e.key==='Tab'){
      var f = modal.querySelectorAll('button,input,[href],[tabindex]:not([tabindex="-1"])');
      f = Array.prototype.filter.call(f, function(x){ return x.offsetParent!==null; });
      if(!f.length) return;
      var first=f[0], last=f[f.length-1];
      if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
    }
  }

  /* ---------- RENDER ---------- */
  function render(){ renderTitle(); renderSteps(); renderBody(); renderFoot(); }

  function renderTitle(){
    var t = state.mode==='notify' ? T.title_notify
      : ['', T.title_pick, T.title_seat, T.title_form, T.title_done][state.step];
    el('bk-title').textContent = t;
  }
  function renderSteps(){
    var box = el('bk-steps');
    if(state.mode==='notify'){ box.innerHTML=''; return; }
    var labels=T.steps, out=[];
    for(var i=0;i<labels.length;i++){
      var n=i+1, cls='s'+(n===state.step?' active':'')+(n<state.step?' done':'');
      out.push('<span class="'+cls+'"><span class="num2">'+n+'</span>'+labels[i]+'</span>');
      if(i<labels.length-1) out.push('<span class="sep">·</span>');
    }
    box.innerHTML = out.join('');
  }

  function renderBody(){
    var b = el('bk-body');
    if(state.mode==='notify'){ b.innerHTML = notifyHtml(); return; }
    if(state.step===1) b.innerHTML = pickHtml();
    else if(state.step===2){ b.innerHTML = seatHtml(); updateSelected(); }
    else if(state.step===3) b.innerHTML = formHtml();
    else if(state.step===4) b.innerHTML = doneHtml();
  }

  function pickHtml(){
    return '<div class="showpick">' + SHOWS.map(function(s,i){
      var sel = state.showIndex===i ? ' sel' : '';
      var st = s.onsale ? '<span class="st">'+T.onsale+'</span>' : '<span class="st soon">'+T.soon+'</span>';
      return '<button data-pick="'+i+'" class="'+sel.trim()+'">'
        + '<span class="dt"><span class="d">'+s.d+'</span><span class="m">'+s.m+'</span></span>'
        + '<span class="ti">'+s.title+'<small>'+s.time+' · '+T.venue+'</small></span>'
        + st + '</button>';
    }).join('') + '</div>';
  }

  function seatHtml(){
    var tabs = ZONE_ORDER.map(function(zk){
      var z=ZONES[zk], a = state.zone===zk?' active':'';
      return '<button data-zone-tab="'+zk+'" class="'+a.trim()+'">'
        + '<div class="zn">'+z.name+'</div><div class="zp">'+vnd(z.price)+'</div><div class="zl">'+z.label+'</div></button>';
    }).join('');
    return '<div class="hall"><div class="stagebar">'+T.stage+'</div><div class="zones">'+tabs+'</div></div>'
      + '<div class="seatwrap"><div class="seatgrid">'+rowsHtml(state.zone)+'</div></div>'
      + '<div class="legend"><span><i class="i-free"></i>'+T.free+'</span><span><i class="i-sel"></i>'+T.sel+'</span><span><i class="i-taken"></i>'+T.taken+'</span></div>'
      + '<div class="chips" id="bk-chips"></div>'
      + '<div class="hint" id="bk-hint">'+T.hint_seat+'</div>';
  }
  function rowsHtml(zk){
    var z=ZONES[zk], taken=takenSet(state.showIndex, zk), out='';
    for(var i=0;i<z.rows.length;i++){
      var row=z.rows[i]; out+='<div class="seatrow"><span class="rl">'+row+'</span>';
      for(var c=1;c<=z.cols;c++){
        var id=zk+'-'+row+c;
        if(taken[row+c]){ out+='<span class="seat taken" aria-hidden="true"></span>'; }
        else{
          var s = state.selected[id]?' sel':'';
          out+='<button class="seat'+s+'" data-seat="'+id+'" data-zone="'+zk+'" data-row="'+row+'" data-num="'+c+'" aria-label="'+(EN?'Seat ':'Ghế ')+zk+' '+row+c+'" aria-pressed="'+(s?'true':'false')+'"></button>';
        }
      }
      out+='</div>';
    }
    return out;
  }

  function formHtml(){
    var s=SHOWS[state.showIndex];
    var list = keys().map(function(k){ var x=state.selected[k]; return x.zone+'·'+x.row+x.num; }).join(', ');
    return '<div class="bform">'
      + '<div class="field full"><label>'+T.name+'</label><input id="f-name" autocomplete="name" placeholder="'+(EN?'Full name':'Nguyễn Văn A')+'"><div class="msg" id="e-name"></div></div>'
      + '<div class="field"><label>Email</label><input id="f-email" type="email" autocomplete="email" placeholder="you@email.com"><div class="msg" id="e-email"></div></div>'
      + '<div class="field"><label>'+T.phone+'</label><input id="f-phone" type="tel" autocomplete="tel" placeholder="09xx xxx xxx"><div class="msg" id="e-phone"></div></div>'
      + '</div>'
      + '<div class="summary">'
      + '<div class="row"><span>'+T.show_lbl+'</span><span>'+s.title+'</span></div>'
      + '<div class="row"><span>'+T.time_lbl+'</span><span>'+s.d+'/'+s.m.replace('Th ','')+' · '+s.time+'</span></div>'
      + '<div class="row"><span>'+T.seats_lbl+' ('+keys().length+')</span><span>'+list+'</span></div>'
      + '<div class="row tot"><span>'+T.total_pay+'</span><b>'+vnd(total())+'</b></div>'
      + '</div>';
  }

  function doneHtml(){
    var s=SHOWS[state.showIndex], list=keys().map(function(k){var x=state.selected[k];return x.zone+'·'+x.row+x.num;}).join(', ');
    return '<div class="done-wrap">'
      + '<div class="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M5 12l5 5L20 6"/></svg></div>'
      + '<h3>'+T.done_h+'</h3>'
      + '<p>'+T.thanks+' <b style="color:var(--cream)">'+state.buyer.name+'</b>. '+T.tix_for+' “'+s.title+'” ('+s.d+'/'+s.m.replace('Th ','')+') '+T.tix_to+' '+state.buyer.email+'.</p>'
      + '<p style="color:var(--muted)">'+T.seats_lbl+': '+list+' · '+vnd(total())+'</p>'
      + '<div class="code">'+state.code+'</div>'
      + '<p class="demo-note">'+T.note_done+'</p>'
      + '</div>';
  }

  function notifyHtml(){
    var s=SHOWS[state.showIndex];
    return '<div class="notify"><p>“'+(s?s.title:'THỨC')+'” — '+T.notify_p+'</p>'
      + '<div class="inline"><input id="n-email" type="email" placeholder="Email"><button class="btn btn-gold btn-sm" id="n-go">'+T.subscribe+'</button></div>'
      + '<div class="msg" id="e-nemail" style="text-align:center;margin-top:.7rem"></div></div>';
  }

  /* ---------- FOOT ---------- */
  function renderFoot(){
    var f = el('bk-foot');
    if(state.mode==='notify'){ f.style.display='none'; f.innerHTML=''; return; }
    f.style.display='';
    var showTotal = (state.step===2 || state.step===3);
    var totalHtml = showTotal ? '<div class="total">'+T.total+'<b id="bk-total">'+vnd(total())+'</b></div>' : '<div class="total"></div>';
    var acts='';
    if(state.step===1) acts='<button class="btn btn-gold btn-sm" id="fwd"'+(state.showIndex==null?' disabled':'')+'>'+T.cont+'</button>';
    if(state.step===2) acts='<button class="btn btn-ghost btn-sm" id="back">'+T.back+'</button><button class="btn btn-gold btn-sm" id="fwd"'+(keys().length?'':' disabled')+'>'+T.cont+'</button>';
    if(state.step===3) acts='<button class="btn btn-ghost btn-sm" id="back">'+T.back+'</button><button class="btn btn-gold btn-sm" id="fwd"'+(state.sending?' disabled':'')+'>'+(state.sending?T.sending:T.confirm)+'</button>';
    if(state.step===4) acts='<button class="btn btn-ghost btn-sm" id="again">'+T.again+'</button><button class="btn btn-gold btn-sm" id="finish">'+T.close+'</button>';
    f.innerHTML = totalHtml + '<div class="acts">'+acts+'</div>';
    wire('back', function(){ state.step--; if(state.step<1)state.step=1; render(); });
    wire('fwd', advance);
    wire('again', function(){ openBooking(null); });
    wire('finish', closeBooking);
  }
  function wire(id, fn){ var b=el(id); if(b) b.addEventListener('click', fn); }

  function advance(){
    if(state.step===1){
      if(state.showIndex==null) return;
      applyPrices(state.showIndex);
      state.step=2;
      loadTaken(state.showIndex, render);
    }
    else if(state.step===2){ if(!keys().length) return; state.step=3; render(); }
    else if(state.step===3){ submitBooking(); }
  }

  /* Gửi đơn đặt vé lên máy chủ — máy chủ tự tính lại tổng tiền và cấp mã */
  function submitBooking(){
    var v = validate(); if(!v || state.sending) return;
    state.buyer = v; state.sending = true; renderFoot();

    var seats = keys().map(function(k){
      var x = state.selected[k];
      return {zone:x.zone, row:x.row, num:x.num};
    });

    fetch('/api/bookings', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        showId: SHOWS[state.showIndex].id,
        name: v.name, email: v.email, phone: v.phone, seats: seats
      })
    })
    .then(function(r){ return r.json().then(function(j){ return {ok:r.ok, body:j}; }); })
    .then(function(res){
      state.sending = false;
      if(!res.ok || !res.body.ok){
        // Ghế vừa bị người khác đặt -> cập nhật lại sơ đồ
        if(res.body.taken){
          delete takenCache[SHOWS[state.showIndex].id];
          res.body.taken.forEach(function(s){ delete state.selected[s.zone+'-'+s.row+s.num]; });
          state.step = 2;
          loadTaken(state.showIndex, function(){
            render();
            var h = el('bk-hint'); if(h) h.textContent = res.body.error;
          });
          return;
        }
        var m = el('e-email'); if(m) m.textContent = res.body.error || T.e_submit;
        renderFoot();
        return;
      }
      state.code = res.body.code;
      state.serverTotal = res.body.totalText;
      var map = takenCache[SHOWS[state.showIndex].id] || {};
      seats.forEach(function(s){ map[s.zone+'-'+s.row+s.num] = true; });
      takenCache[SHOWS[state.showIndex].id] = map;
      state.step = 4; render();
    })
    .catch(function(){
      state.sending = false;
      var m = el('e-email'); if(m) m.textContent = T.e_conn;
      renderFoot();
    });
  }

  function validate(){
    var name=el('f-name').value.trim(), email=el('f-email').value.trim(), phone=el('f-phone').value.trim(), ok=true;
    function set(fid,mid,msg){ el(fid).classList.toggle('err',!!msg); el(mid).textContent=msg||''; if(msg)ok=false; }
    set('f-name','e-name', name.length<2 ? T.e_name : '');
    set('f-email','e-email', /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? '' : T.e_email);
    set('f-phone','e-phone', /^[0-9\s+.]{8,}$/.test(phone) ? '' : T.e_phone);
    return ok ? {name:name,email:email,phone:phone} : null;
  }

  /* ---------- SELECTED (chips + total) ---------- */
  function updateSelected(){
    var chips=el('bk-chips');
    if(chips){
      var ks=keys();
      chips.innerHTML = ks.length
        ? ks.map(function(k){ var x=state.selected[k]; return '<button class="chip" data-remove="'+k+'" aria-label="'+(EN?'Remove seat ':'Bỏ ghế ')+x.zone+' '+x.row+x.num+'"><b>'+x.zone+'</b> '+x.row+x.num+' ✕</button>'; }).join('')
        : '<span class="hint" style="margin:0">'+T.none_sel+'</span>';
    }
    var t=el('bk-total'); if(t) t.textContent=vnd(total());
    var fwd=el('fwd'); if(fwd && state.step===2){ if(keys().length) fwd.removeAttribute('disabled'); else fwd.setAttribute('disabled',''); }
  }

  /* ---------- CLICKS INSIDE MODAL ---------- */
  modal.addEventListener('click', function(e){
    if(e.target.closest('[data-close]')){ closeBooking(); return; }

    var pick=e.target.closest('[data-pick]');
    if(pick){
      var i=+pick.getAttribute('data-pick');
      if(SHOWS[i].onsale){ state.showIndex=i; applyPrices(i); renderBody(); renderFoot(); renderTitle(); }
      else { state.mode='notify'; state.showIndex=i; render(); }
      // cập nhật highlight
      Array.prototype.forEach.call(modal.querySelectorAll('[data-pick]'), function(b){ b.classList.toggle('sel', +b.getAttribute('data-pick')===state.showIndex); });
      return;
    }

    var seat=e.target.closest('[data-seat]');
    if(seat){
      var id=seat.getAttribute('data-seat');
      if(state.selected[id]){ delete state.selected[id]; seat.classList.remove('sel'); seat.setAttribute('aria-pressed','false'); }
      else{
        if(keys().length>=MAX){ var h=el('bk-hint'); if(h) h.textContent=T.max; return; }
        var zk=seat.getAttribute('data-zone');
        state.selected[id]={zone:zk,row:seat.getAttribute('data-row'),num:seat.getAttribute('data-num'),price:ZONES[zk].price};
        seat.classList.add('sel'); seat.setAttribute('aria-pressed','true');
      }
      updateSelected(); return;
    }

    var ztab=e.target.closest('[data-zone-tab]');
    if(ztab){ state.zone=ztab.getAttribute('data-zone-tab'); renderBody(); return; }

    var rm=e.target.closest('[data-remove]');
    if(rm){
      var rid=rm.getAttribute('data-remove'); delete state.selected[rid];
      var btn=modal.querySelector('[data-seat="'+rid+'"]'); if(btn){ btn.classList.remove('sel'); btn.setAttribute('aria-pressed','false'); }
      updateSelected(); return;
    }

    if(e.target.closest('#n-go')){
      var em=el('n-email').value.trim(), msg=el('e-nemail');
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){ msg.textContent=T.e_email; el('n-email').classList.add('err'); return; }
      msg.textContent=T.sending;
      fetch('/api/subscribe', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({email:em, source:'mo-ban-' + (SHOWS[state.showIndex] ? SHOWS[state.showIndex].id : '')})
      })
      .then(function(r){ return r.json(); })
      .then(function(j){
        if(!j.ok){ msg.textContent = j.error || T.e_submit; return; }
        el('bk-body').innerHTML='<div class="done-wrap"><div class="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M5 12l5 5L20 6"/></svg></div><h3>'+T.subscribed_h+'</h3><p>'+T.subscribed_p(em)+'</p></div>';
        el('bk-title').textContent=T.title_done;
      })
      .catch(function(){ msg.textContent=T.e_conn; });
      return;
    }
  });

  /* ---------- MỞ MODAL TỪ CÁC NÚT TRÊN TRANG ---------- */
  var showRows = Array.prototype.slice.call(document.querySelectorAll('#lich-dien .show'));
  document.addEventListener('click', function(e){
    if(e.target.closest('#booking')) return;
    var gold=e.target.closest('.btn-gold');
    var href = gold && gold.getAttribute('href');
    if(href==='#lich-dien' || href==='/#lich-dien'){ e.preventDefault(); openBooking(null); return; }
    var row=e.target.closest('#lich-dien .show');
    if(row){ e.preventDefault(); var idx=showRows.indexOf(row); openBooking(idx>=0?idx:null); }
  });
})();
