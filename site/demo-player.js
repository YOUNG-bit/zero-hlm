(() => {
  const shell = document.querySelector('.project-demo');
  if (!shell) return;
  const video = shell.querySelector('.project-demo-video');
  const start = shell.querySelector('.project-demo-start');
  const loading = shell.querySelector('.project-demo-loading');
  const error = shell.querySelector('.project-demo-error');
  const cover = shell.querySelector('.project-demo-poster');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let inView = false;
  let failed = false;
  let pending = false;
  let playRequest = 0;

  function setLoading(show) {
    loading.hidden = !show;
    shell.classList.toggle('is-waiting', show);
  }
  function showError() {
    failed = true;
    pending = false;
    setLoading(false);
    error.hidden = false;
    start.hidden = false;
    start.querySelector('span:last-child').textContent = 'Try again';
  }
  function pause() {
    ++playRequest;
    pending = false;
    video.pause();
    setLoading(false);
  }
  async function play() {
    if (pending) return;
    const request = ++playRequest;
    pending = true;
    start.hidden = true;
    error.hidden = true;
    video.preload = 'auto';
    video.muted = true;
    if (!video.getAttribute('src')) {
      video.src = video.dataset.src;
      video.load();
    } else if (failed) {
      video.load();
    }
    failed = false;
    setLoading(video.readyState < 3);
    try {
      await video.play();
    } catch (reason) {
      if (request !== playRequest || reason.name === 'AbortError') return;
      if (reason.name === 'NotAllowedError') {
        setLoading(false);
        start.hidden = false;
        start.querySelector('span:last-child').textContent = 'Play demo';
      } else showError();
    } finally {
      if (request === playRequest) pending = false;
    }
  }
  start.addEventListener('click', play);
  video.addEventListener('playing', () => {
    cover.hidden = true;
    start.hidden = true;
    error.hidden = true;
    setLoading(false);
  });
  video.addEventListener('waiting', () => setLoading(inView && !video.paused));
  video.addEventListener('seeking', () => setLoading(inView && !video.paused));
  video.addEventListener('seeked', () => setLoading(inView && !video.paused && video.readyState < 3));
  video.addEventListener('canplay', () => setLoading(false));
  video.addEventListener('pause', () => setLoading(false));
  video.addEventListener('error', showError);

  function updateVisibility() {
    const rect = shell.getBoundingClientRect();
    const visible = !document.hidden && (document.fullscreenElement === video ||
      Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0)) /
      Math.max(1, Math.min(rect.height, innerHeight)) >= .35);
    if (visible === inView) return;
    inView = visible;
    if (!visible) pause();
    else if (!reducedMotion.matches && !failed) play();
  }
  document.addEventListener('visibilitychange', updateVisibility);
  document.addEventListener('fullscreenchange', updateVisibility);
  addEventListener('scroll', updateVisibility, {passive:true});
  addEventListener('resize', updateVisibility);
  new IntersectionObserver(updateVisibility).observe(shell);
  window.addEventListener('pagehide', pause);
  updateVisibility();
})();
