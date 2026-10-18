// DUB radio: the site's song through YouTube's embedded player, kept out of sight; the Music button turns it on and
// off. Browsers only allow sound after a visitor interacts, so on desktop it starts with the first click or key press,
// unless the visitor turned it off before. On phones it starts when they tap Music.
(() => {
  'use strict';
  const VID = 'Yhu7sck0gAA', VOL = 45, LOW = 16;
  const $ = s => document.querySelector(s);
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const box = $('#radio'); if (!box) return;
  const btn = $('#rBtn');
  let player = null, ready = false, want = false, apiP = null, ducked = false;
  function loadApi() {
    if (apiP) return apiP;
    apiP = new Promise((res, rej) => {
      if (window.YT && window.YT.Player) return res();
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { try { if (prev) prev(); } catch {} res(); };
      const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.async = true; s.onerror = () => rej(new Error('blocked')); document.head.appendChild(s);
      setTimeout(() => rej(new Error('timeout')), 20000);
    });
    return apiP;
  }
  function make() {
    return loadApi().then(() => new Promise(res => {
      if (player) return res();
      player = new window.YT.Player('ytp', {
        width: 200, height: 200, videoId: VID,
        playerVars: { autoplay: 0, controls: 1, loop: 1, playlist: VID, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, fs: 0 },
        events: {
          onReady: e => { ready = true; try { e.target.setVolume(ducked ? LOW : VOL); } catch {} if (want) e.target.playVideo(); res(); },
          onStateChange: e => { const P = window.YT.PlayerState; box.classList.toggle('playing', e.data === P.PLAYING); if (e.data === P.ENDED) { e.target.seekTo(0, true); e.target.playVideo(); } },
          onError: () => { fail(); res(); },
        },
      });
    }));
  }
  let failed = false;
  function fail() { failed = true; box.classList.add('fail'); box.classList.remove('open', 'playing'); }
  function on() {
    want = true; store.set('dub.music', 'on'); box.classList.add('open');
    if (ready) { try { player.playVideo(); } catch {} } else make().catch(fail);
  }
  function off() { want = false; store.set('dub.music', 'off'); box.classList.remove('open', 'playing'); if (ready) { try { player.pauseVideo(); } catch {} } }
  btn.addEventListener('click', () => { if (failed) { window.open('https://www.youtube.com/watch?v=' + VID, '_blank', 'noopener'); return; } box.classList.contains('open') ? off() : on(); });
  const pref = store.get('dub.music');
  if (pref !== 'off' && !matchMedia('(max-width: 640px), (pointer: coarse)').matches) {
    // get the player ready in the background so the first click can start it straight away
    const idle = window.requestIdleCallback || (f => setTimeout(f, 1800));
    idle(() => make().catch(() => {}), { timeout: 4000 });
    const first = e => {
      if (e.target && e.target.closest && e.target.closest('#radio')) return;
      removeEventListener('pointerdown', first, true); removeEventListener('keydown', first, true);
      if (store.get('dub.music') !== 'off') on();
    };
    addEventListener('pointerdown', first, true); addEventListener('keydown', first, true);
  }
  // the game asks for quiet: the music keeps going, just lower
  window.DUBM = { duck(d) { ducked = d; if (ready) { try { player.setVolume(d ? LOW : VOL); } catch {} } } };
})();
