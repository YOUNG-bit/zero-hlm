(() => {
  const video = document.querySelector('#abstract-highlight-video');
  if (!video) return;
  const error = video.parentElement.querySelector('.abstract-highlight-error');
  let inView = false;
  setupVideoLoading(video);

  function update() {
    const visible = !document.hidden && isAutoplayVisible(video, 0.55);
    const entered = visible && !inView;
    inView = visible;
    if (!visible) {
      stopVideo(video);
      return;
    }
    if (!video.getAttribute('src')) {
      video.src = video.dataset.src;
      video.preload = 'metadata';
      video.load();
    }
    if (entered && !reduceMotion.matches && !video.error) {
      safeRequestVideoPlay(video);
    }
  }

  video.addEventListener('play', () => {
    if (document.hidden || !isAutoplayVisible(video, 0.55)) stopVideo(video);
    else showVideoLoading(video);
  });
  video.addEventListener('error', () => { error.hidden = false; });
  video.addEventListener('loadeddata', () => { error.hidden = true; });
  new IntersectionObserver(update, {threshold: [0, 0.55, 1]}).observe(video);
  document.addEventListener('visibilitychange', update);
  addEventListener('scroll', update, {passive: true});
  addEventListener('resize', update);
  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches) stopVideo(video);
  });
  update();
})();
