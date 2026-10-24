(() => {
  const shell = document.querySelector('.project-demo');
  if (!shell) return;
  const start = shell.querySelector('.project-demo-start');
  const loading = shell.querySelector('.project-demo-loading');
  const error = shell.querySelector('.project-demo-error');
  const cover = shell.querySelector('.project-demo-poster');
  const host = shell.querySelector('.project-demo-embed');
  let player = null;
  let ready = false;
  let apiPromise = null;
  let readyTimer = null;
  let inView = false;
  let attempted = false;
  let pending = false;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  function setLoading(show) {
    loading.hidden = !show;
    shell.classList.toggle('is-waiting', show);
  }
  function showError() {
    clearTimeout(readyTimer);
    ready = false;
    pending = false;
    player?.destroy();
    player = null;
    host.replaceChildren();
    cover.hidden = false;
    setLoading(false);
    error.hidden = false;
    start.hidden = false;
    start.querySelector('span:last-child').textContent = 'Try again';
  }
  function loadAPI() {
    if (window.YT?.Player) return Promise.resolve();
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => {
        script.remove();
        reject(new Error('YouTube connection timed out'));
      }, 12000);
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        clearTimeout(timeout);
        previous?.();
        resolve();
      };
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => {
        clearTimeout(timeout);
        script.remove();
        reject(new Error('YouTube could not load'));
      };
      document.head.append(script);
    }).catch(err => { apiPromise = null; throw err; });
    return apiPromise;
  }
  function pause() { if (ready) player.pauseVideo(); }
  async function play() {
    if (pending) return;
    if (ready) { start.hidden = true; player.playVideo(); return; }
    attempted = true;
    pending = true;
    start.hidden = true;
    error.hidden = true;
    setLoading(true);
    readyTimer = setTimeout(showError, 15000);
    try {
      await loadAPI();
      if (!pending) return;
      const mount = document.createElement('div');
      host.replaceChildren(mount);

      player = new YT.Player(mount, {
        width: '100%', height: '100%', videoId: shell.dataset.youtubeId,
        playerVars: {autoplay: 0, controls: 1, playsinline: 1, rel: 0, origin: location.origin},
        events: {
          onReady(event) {
            clearTimeout(readyTimer);
            ready = true;
            pending = false;
            event.target.mute();
            cover.hidden = true;
            setLoading(false);
            const iframe = event.target.getIframe();
            iframe.title = 'Zero-HLM — complete project demo on YouTube';
            iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
            if (inView && !document.hidden) event.target.playVideo();
          },
          onStateChange(event) {
            setLoading(event.data === YT.PlayerState.BUFFERING);
            if (event.data === YT.PlayerState.ENDED && inView && !document.hidden) {
              event.target.seekTo(0, true);
              event.target.playVideo();
            }
          },
          onAutoplayBlocked() { setLoading(false); start.hidden = false; },
          onError: showError
        }
      });
    } catch { showError(); }
  }
  start.addEventListener('click', play);
  function updateVisibility() {
    const rect = shell.getBoundingClientRect();
    const visible = !document.hidden && Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0)) / Math.max(1, Math.min(rect.height, innerHeight)) >= .35;
    if (visible === inView) return;
    inView = visible;
    if (!visible) { if (!document.fullscreenElement) pause(); setLoading(false); }
    else if (!reducedMotion.matches) { if (ready) player.playVideo(); else if (!attempted) play(); }
  }
  document.addEventListener('visibilitychange', updateVisibility);
  addEventListener('scroll', updateVisibility, {passive:true});
  addEventListener('resize', updateVisibility);
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) loadAPI().catch(() => {});
  }, {rootMargin:'400px'}).observe(shell);
  updateVisibility();
  new IntersectionObserver(([entry]) => {
    updateVisibility();
  }).observe(shell);
  window.addEventListener('pagehide', pause);
})();
