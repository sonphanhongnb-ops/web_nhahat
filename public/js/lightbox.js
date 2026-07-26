(function(){
  var lb=document.getElementById('lightbox'); if(!lb) return;
  var im=lb.querySelector('img');
  document.querySelectorAll('.gallery figure[data-full]:not(.slot)').forEach(function(fig){
    fig.addEventListener('click',function(){ var s=fig.querySelector('img'); if(!s)return; im.src=fig.getAttribute('data-full')||s.src; lb.classList.add('open'); lb.setAttribute('aria-hidden','false'); });
  });
  function close(){ lb.classList.remove('open'); lb.setAttribute('aria-hidden','true'); }
  lb.addEventListener('click',close);
  document.addEventListener('keydown',function(e){ if(e.key==='Escape') close(); });
})();
