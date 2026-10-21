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

  function setLoading(show) {
    loading.hidden = !show || ready;
    shell.classList.toggle('is-waiting', show);
  }
  function showError() {
    clearTimeout(readyTimer);
    ready = false;
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
      }, 20000);
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
  start.addEventListener('click', async () => {
    start.hidden = true;
    error.hidden = true;
    setLoading(true);
    try {
      await loadAPI();
      const mount = document.createElement('div');
      host.replaceChildren(mount);
      readyTimer = setTimeout(showError, 25000);
      player = new YT.Player(mount, {
        width: '100%', height: '100%', videoId: shell.dataset.youtubeId,
        playerVars: {autoplay: 1, controls: 1, playsinline: 1, rel: 0, origin: location.origin},
        events: {
          onReady(event) {
            clearTimeout(readyTimer);
            ready = true;
            cover.hidden = true;
            setLoading(false);
            const iframe = event.target.getIframe();
            iframe.title = 'Zero-HLM — complete project demo on YouTube';
            iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
            if (!document.hidden) event.target.playVideo();
          },
          onStateChange(event) { setLoading(event.data === YT.PlayerState.BUFFERING); },
          onError: showError
        }
      });
    } catch { showError(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting && !document.fullscreenElement) pause();
  }).observe(shell);
  window.addEventListener('pagehide', pause);
})();
