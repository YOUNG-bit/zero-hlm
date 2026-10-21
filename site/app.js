const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const MEDIA_READY_TO_PLAY = typeof HTMLMediaElement === 'undefined' ? 3 : (HTMLMediaElement.HAVE_FUTURE_DATA || 3);
const playbackState = new WeakMap();
function playbackContainer(video) { return video?.closest('.panel-media, .method-video-card, .data-media-stack, .abstract-highlight'); }
function setupVideoLoading(video, label = 'Loading…') {
  const container = playbackContainer(video);
  if (!video || !container) return null;
  if (playbackState.has(video)) return playbackState.get(video);
  let loader = container.querySelector(':scope > .video-loading');
  if (!loader) {
    loader = document.createElement('div');
    loader.className = 'video-loading';
    loader.hidden = true;
    loader.setAttribute('role', 'status');
    loader.setAttribute('aria-live', 'polite');
    loader.innerHTML = '<span aria-hidden="true"></span><em></em>';
    container.appendChild(loader);
  }
  loader.querySelector('em').textContent = label;
  const state = {container, loader, playRequested: false, token: 0};
  playbackState.set(video, state);
  function refresh() {
    const show = state.playRequested && !video.ended && (video.seeking || video.readyState < MEDIA_READY_TO_PLAY);
    container.classList.toggle('is-buffering', show);
    loader.hidden = !show;
  }
  ['waiting','stalled','seeking','loadstart'].forEach(type => video.addEventListener(type, refresh));
  ['playing','canplay','canplaythrough','seeked','loadeddata'].forEach(type => video.addEventListener(type, refresh));
  ['pause','ended','error','abort','emptied'].forEach(type => video.addEventListener(type, () => {
    if (video.paused || video.ended || type === 'error' || (type === 'emptied' && !state.playRequested)) state.playRequested = false;
    refresh();
  }));
  return state;
}
function showVideoLoading(video) {
  const state = setupVideoLoading(video);
  if (!state) return 0;
  state.playRequested = true;
  state.token += 1;
  const show = video.seeking || video.readyState < MEDIA_READY_TO_PLAY;
  state.container.classList.toggle('is-buffering', show);
  state.loader.hidden = !show;
  return state.token;
}
function clearVideoLoading(video, token = 0) {
  const state = playbackState.get(video);
  if (!state || (token && token !== state.token)) return;
  if (video.paused || video.ended || video.readyState >= MEDIA_READY_TO_PLAY) {
    state.container.classList.remove('is-buffering');
    state.loader.hidden = true;
  }
}
function stopVideo(video) {
  const state = playbackState.get(video);
  if (state) {
    state.playRequested = false;
    state.token += 1;
    state.container.classList.remove('is-buffering');
    state.loader.hidden = true;
  }
  video?.pause();
}
function requestVideoPlay(video) {
  const token = showVideoLoading(video);
  return video.play().then(() => { clearVideoLoading(video, token); return true; });
}
function isAutoplayVisible(el, minRatio = 0.35) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const viewportHeight = innerHeight || document.documentElement.clientHeight;
  const viewportWidth = innerWidth || document.documentElement.clientWidth;
  const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
  const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
  const area = Math.max(1, rect.width * rect.height);
  return visibleWidth * visibleHeight / area >= minRatio;
}
function ignoreAbort(err) { return err?.name === 'AbortError'; }
function safeRequestVideoPlay(video, onError) {
  return requestVideoPlay(video).catch(err => { if (!ignoreAbort(err)) onError?.(err); });
}
function isPagePlayable() { return !document.hidden; }
function safeEnsureAndPlay(video, onError) {
  if (!video) return Promise.resolve();
  if (video.dataset.src && !video.getAttribute('src')) { video.src = video.dataset.src; video.load(); }
  return safeRequestVideoPlay(video, onError);
}
const pendingVideoSeeks = new WeakMap();
function safeSeekVideo(video, target, onApplied) {
  if (!video || !Number.isFinite(target)) return false;
  pendingVideoSeeks.get(video)?.cancel();
  const hinted = Number(video.dataset.duration || 0);
  const duration = Number.isFinite(video.duration) && video.duration ? video.duration : hinted;
  const clamped = duration ? Math.min(Math.max(target, 0), duration) : Math.max(target, 0);
  const source = () => video.getAttribute('src') || video.dataset.src || '';
  const expectedSrc = source();
  const pending = {cancel: () => video.removeEventListener('loadedmetadata', apply)};
  const apply = () => {
    if (pendingVideoSeeks.get(video) !== pending) return false;
    pendingVideoSeeks.delete(video);
    const currentSrc = source();
    if (expectedSrc && currentSrc && currentSrc !== expectedSrc) return false;
    try {
      video.currentTime = clamped;
      onApplied?.(clamped);
      return true;
    } catch { return false; }
  };
  pendingVideoSeeks.set(video, pending);
  if (video.readyState === 0) {
    if (video.dataset.src && !video.getAttribute('src')) { video.src = video.dataset.src; video.load(); }
    video.addEventListener('loadedmetadata', apply, {once:true});
    onApplied?.(clamped);
    return true;
  }
  return apply();
}
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2,'0')}`;
}
const menuButton = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('.site-nav');
function closeMenu() { siteNav.classList.remove('is-open'); menuButton.setAttribute('aria-expanded','false'); menuButton.setAttribute('aria-label','Open navigation'); }
menuButton.addEventListener('click', () => {
  const open = siteNav.classList.toggle('is-open');
  menuButton.setAttribute('aria-expanded',String(open));
  menuButton.setAttribute('aria-label',open ? 'Close navigation' : 'Open navigation');
});
document.querySelectorAll('.nav-links a').forEach(a => a.addEventListener('click', () => {
  closeMenu();
  if (a.dataset.methodStep) {
    setTimeout(() => document.querySelector(`#method-tab-${a.dataset.methodStep}`)?.click(), 180);
  }
}));
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
const abstractCharts = [...document.querySelectorAll('.mini-chart')];
if (abstractCharts.length) {
  function updateChartVisibility() {
    const viewportHeight = innerHeight || document.documentElement.clientHeight;
    const topGuard = 88;
    abstractCharts.forEach(chart => {
      const rect = chart.getBoundingClientRect();
      const plot = chart.querySelector('.chart-plot');
      const plotRect = plot ? plot.getBoundingClientRect() : rect;
      const availableHeight = viewportHeight - topGuard;
      const fullyVisible = rect.height > availableHeight
        ? plotRect.top >= topGuard && plotRect.bottom <= viewportHeight
        : rect.top >= topGuard && rect.bottom <= viewportHeight;
      const fullyExited = rect.bottom <= 0 || rect.top >= viewportHeight;
      if (reduceMotion.matches || fullyVisible) chart.classList.add('is-visible');
      else if (fullyExited) chart.classList.remove('is-visible');
    });
  }
  addEventListener('scroll', updateChartVisibility, {passive: true});
  addEventListener('resize', updateChartVisibility);
  updateChartVisibility();
}
const methodTabs = [...document.querySelectorAll('.method-tab')];
const methodGrid = document.querySelector('.method-grid');
const methodVideo = document.querySelector('#method-video');
const methodToggle = document.querySelector('#method-toggle');
const methodReplay = document.querySelector('#method-replay');
const methodSeek = document.querySelector('#method-seek');
const methodCurrent = document.querySelector('#method-current');
const methodDuration = document.querySelector('#method-duration');
const methodError = document.querySelector('#method-error');
const methodExpand = document.querySelector('#method-expand');
const methodStage = document.querySelector('.method-stage');
if (methodExpand) {
  methodExpand.hidden = !methodStage?.requestFullscreen && !methodVideo?.webkitEnterFullscreen;
  methodExpand.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (methodStage?.requestFullscreen) await methodStage.requestFullscreen();
      else methodVideo?.webkitEnterFullscreen?.();
    } catch { /* Keep the inline player usable if fullscreen is unavailable. */ }
  });
  document.addEventListener('fullscreenchange', () => {
    const expanded = document.fullscreenElement === methodStage;
    methodExpand.textContent = expanded ? 'Exit full screen' : 'Expand';
    methodExpand.setAttribute('aria-label', expanded ? 'Exit full screen' : 'Expand method video');
  });
}
let methodSeeking = false;
let methodResumeAfterSeek = false;
let methodSeekTarget = 0;
let methodCommittedSeekTime = null;
let methodInView = false;
let methodUserPaused = false;
function setMethodTimeDisplay(current = 0) {
  if (!methodVideo || !methodSeek) return;
  const metadataDuration = Number.isFinite(methodVideo.duration) ? methodVideo.duration : 0;
  const hintedDuration = Number(methodVideo.dataset.duration || 0);
  const duration = metadataDuration || hintedDuration || 0;
  const clamped = duration ? Math.min(Math.max(current, 0), duration) : 0;
  methodSeek.disabled = !metadataDuration;
  methodSeek.value = String(Math.round(duration ? clamped / duration * 1000 : 0));
  methodSeek.style.setProperty('--seek-progress', `${duration ? clamped / duration * 100 : 0}%`);
  methodCurrent.textContent = formatTime(clamped);
  methodDuration.textContent = formatTime(duration);
  methodSeek.setAttribute('aria-valuetext', `${formatTime(clamped)} of ${formatTime(duration)}`);
}
function setMethodToggle(paused) {
  if (!methodToggle) return;
  methodToggle.textContent = paused ? 'Play' : 'Pause';
  methodToggle.setAttribute('aria-label', paused ? 'Play method video' : 'Pause method video');
}
function loadMethodStep(tab, autoplay = true) {
  if (!tab || !methodVideo) return;
  methodTabs.forEach(item => {
    const active = item === tab;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-selected', String(active));
    item.tabIndex = active ? 0 : -1;
  });
  methodGrid?.setAttribute('data-active-step', tab.dataset.step || '1');
  const stepLabel = String(tab.dataset.step || '1').padStart(2,'0');
  const title = tab.querySelector('strong')?.textContent || '';
  methodVideo.setAttribute('aria-label', `Zero-HLM method step ${stepLabel}: ${title}`);
  methodVideo.dataset.duration = tab.dataset.duration || '';
  if (methodError) methodError.hidden = true;
  const src = tab.dataset.src || '';
  const currentSrc = methodVideo.getAttribute('src') || '';
  if (!currentSrc.endsWith(src.replace('./',''))) {
    stopVideo(methodVideo);
    methodSeeking = false;
    methodResumeAfterSeek = false;
    methodSeekTarget = 0;
    methodCommittedSeekTime = null;
    methodVideo.removeAttribute('src');
    methodVideo.poster = tab.dataset.poster || '';
    methodVideo.dataset.src = src;
    if (autoplay) {
      methodVideo.src = src;
      methodVideo.load();
    }
  }
  setMethodTimeDisplay(0);
  if (autoplay && isPagePlayable() && !reduceMotion.matches && methodInView) {
    methodUserPaused = false;
    safeEnsureAndPlay(methodVideo, () => { if (methodError) methodError.hidden = false; setMethodToggle(true); })
      .then(() => { if (!methodVideo.paused) setMethodToggle(false); });
  }
}
function advanceMethodStep() {
  setMethodToggle(true);
  if (methodSeeking || methodUserPaused || !methodInView || !isPagePlayable() || reduceMotion.matches) return;
  const activeIndex = methodTabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true');
  const nextTab = activeIndex >= 0 ? methodTabs[activeIndex + 1] : null;
  if (nextTab) loadMethodStep(nextTab);
}
function playVisibleMethod() {
  if (!methodVideo || !isPagePlayable() || reduceMotion.matches || !methodInView || methodUserPaused || methodSeeking) return;
  if (methodError) methodError.hidden = true;
  safeEnsureAndPlay(methodVideo, () => { if (methodError) methodError.hidden = false; setMethodToggle(true); })
    .then(() => { if (!methodVideo.paused) setMethodToggle(false); });
}
function pauseMethodForViewport() {
  if (!methodVideo) return;
  stopVideo(methodVideo);
  setMethodToggle(true);
}
function updateMethodViewportState(force = false) {
  if (!methodVideo) return;
  const visible = isPagePlayable() && isAutoplayVisible(methodVideo, 0.35);
  if (!force && visible === methodInView) return;
  const wasInView = methodInView;
  methodInView = visible;
  if (visible) playVisibleMethod();
  else if (wasInView || force) { methodUserPaused = false; pauseMethodForViewport(); }
}
methodTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => loadMethodStep(tab));
  tab.addEventListener('keydown', event => {
    const last = methodTabs.length - 1;
    let next = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = last;
    if (next !== null) { event.preventDefault(); methodTabs[next].focus(); loadMethodStep(methodTabs[next]); }
  });
});
if (methodVideo) {
  methodVideo.addEventListener('loadedmetadata', () => { if (!methodSeeking && methodCommittedSeekTime === null) setMethodTimeDisplay(methodVideo.currentTime || 0); });
  methodVideo.addEventListener('timeupdate', () => {
    const displayTime = methodCommittedSeekTime !== null && Math.abs((methodVideo.currentTime || 0) - methodCommittedSeekTime) > 0.2 ? methodCommittedSeekTime : methodVideo.currentTime || 0;
    if (!methodSeeking) setMethodTimeDisplay(displayTime);
    if (methodCommittedSeekTime !== null && Math.abs((methodVideo.currentTime || 0) - methodCommittedSeekTime) <= 0.25) methodCommittedSeekTime = null;
  });
  methodVideo.addEventListener('seeked', () => { const t = methodCommittedSeekTime ?? (methodVideo.currentTime || 0); methodCommittedSeekTime = null; if (!methodSeeking) setMethodTimeDisplay(t); });
  methodVideo.addEventListener('play', () => setMethodToggle(false));
  methodVideo.addEventListener('playing', () => { clearVideoLoading(methodVideo); setMethodToggle(false); });
  methodVideo.addEventListener('pause', () => setMethodToggle(true));
  methodVideo.addEventListener('ended', advanceMethodStep);
  methodVideo.addEventListener('error', () => { clearVideoLoading(methodVideo); if (methodError) methodError.hidden = false; setMethodToggle(true); });
  methodVideo.addEventListener('loadeddata', () => { if (methodError) methodError.hidden = true; });
  new IntersectionObserver(() => updateMethodViewportState(), {threshold:[0,0.08,0.35,0.6,1]}).observe(methodVideo);
  addEventListener('scroll', () => updateMethodViewportState(), {passive: true});
  addEventListener('resize', () => updateMethodViewportState());
}
methodToggle?.addEventListener('click', () => {
  if (methodVideo.paused) {
    if (!isPagePlayable()) return;
    methodUserPaused = false;
    if (methodError) methodError.hidden = true;
    if (!methodVideo.getAttribute('src')) { methodVideo.src = methodVideo.dataset.src; methodVideo.load(); }
    safeRequestVideoPlay(methodVideo, () => { if (methodError) methodError.hidden = false; setMethodToggle(true); });
  } else { methodUserPaused = methodInView; stopVideo(methodVideo); }
});
methodReplay?.addEventListener('click', () => {
  if (!isPagePlayable()) return;
  if (methodError) methodError.hidden = true;
  if (!methodVideo.getAttribute('src')) { methodVideo.src = methodVideo.dataset.src; methodVideo.load(); }
  safeSeekVideo(methodVideo, 0, t => { methodCommittedSeekTime = t; setMethodTimeDisplay(t); });
  methodUserPaused = false;
  safeRequestVideoPlay(methodVideo, () => { if (methodError) methodError.hidden = false; setMethodToggle(true); });
});
function methodTimeFromSeek() {
  const duration = (Number.isFinite(methodVideo.duration) ? methodVideo.duration : 0) || Number(methodVideo.dataset.duration || 0);
  return duration ? Number(methodSeek.value) / 1000 * duration : 0;
}
function beginMethodSeek() { if (!methodVideo || methodSeek.disabled || methodSeeking) return; methodSeeking = true; methodSeekTarget = methodVideo.currentTime || 0; methodResumeAfterSeek = !methodVideo.paused && !methodVideo.ended; if (methodResumeAfterSeek) stopVideo(methodVideo); }
function previewMethodSeek() { if (!methodVideo || methodSeek.disabled) return; methodSeekTarget = methodTimeFromSeek(); setMethodTimeDisplay(methodSeekTarget); }
function endMethodSeek() {
  if (!methodVideo || !methodSeeking) return;
  const target = Number.isFinite(methodSeekTarget) ? methodSeekTarget : methodTimeFromSeek();
  const shouldResume = methodResumeAfterSeek;
  methodCommittedSeekTime = target;
  setMethodTimeDisplay(target);
  if (shouldResume) showVideoLoading(methodVideo);
  safeSeekVideo(methodVideo, target, t => { methodCommittedSeekTime = t; setMethodTimeDisplay(t); });
  methodSeeking = false;
  if (shouldResume) safeRequestVideoPlay(methodVideo, () => setMethodToggle(true));
  methodResumeAfterSeek = false;
  methodSeekTarget = 0;
}
methodSeek?.addEventListener('pointerdown', beginMethodSeek);
methodSeek?.addEventListener('input', () => { if (!methodSeeking) beginMethodSeek(); previewMethodSeek(); });
methodSeek?.addEventListener('change', endMethodSeek);
methodSeek?.addEventListener('pointerup', endMethodSeek);
methodSeek?.addEventListener('pointercancel', endMethodSeek);
methodSeek?.addEventListener('blur', endMethodSeek);
if (methodTabs[0]) loadMethodStep(methodTabs[0], false);
const dataTasks = {
  'task-a': {label: 'Task 1', title: 'Mobile Pick-and-Place', episodes: [
      {label: 'Episode 01', src: './media/data-task-a-ep-01.mp4?v=source-gs-mesh-v1', poster: './media/data-task-a-ep-01.jpg?v=source-gs-mesh-v1'},
      {label: 'Episode 02', src: './media/data-task-a-ep-02.mp4?v=source-gs-mesh-v1', poster: './media/data-task-a-ep-02.jpg?v=source-gs-mesh-v1'},
      {label: 'Episode 03', src: './media/data-task-a-ep-03.mp4?v=source-gs-mesh-v1', poster: './media/data-task-a-ep-03.jpg?v=source-gs-mesh-v1'}
    ]},
  'task-b': {label: 'Task 2', title: 'Low-Reach Hat Placement', episodes: [
      {label: 'Episode 01', src: './media/data-task-b-ep-01.mp4', poster: './media/data-task-b-ep-01.jpg'},
      {label: 'Episode 02', src: './media/data-task-b-ep-02.mp4', poster: './media/data-task-b-ep-02.jpg'},
      {label: 'Episode 03', src: './media/data-task-b-ep-03.mp4', poster: './media/data-task-b-ep-03.jpg'}
    ]},
  'task-c': {label: 'Task 3', title: 'Leg-Assisted Basket Transport', episodes: [
      {label: 'Episode 01', src: './media/data-task-c-ep-01.mp4', poster: './media/data-task-c-ep-01.jpg'},
      {label: 'Episode 02', src: './media/data-task-c-ep-02.mp4', poster: './media/data-task-c-ep-02.jpg'},
      {label: 'Episode 03', src: './media/data-task-c-ep-03.mp4', poster: './media/data-task-c-ep-03.jpg'}
    ]},
};
const dataTabs = [...document.querySelectorAll('.data-tab')];
const dataLayout = document.querySelector('.data-layout');
const dataPanel = document.querySelector('#data-panel');
const dataGrid = document.querySelector('.data-grid');
const dataCards = [...document.querySelectorAll('.data-card')];
const dataToggle = document.querySelector('#data-toggle');
const dataReplayAll = document.querySelector('#data-replay-all');
const dataStatus = document.querySelector('#data-status');
let activeDataTask = 'task-a';
let dataUserPaused = false;
const dataVisibleCards = new Set();
function dataVideos() { return dataCards.map(card => card.querySelector('.data-video')).filter(Boolean); }
function dataPlayableVideos() { return [...dataVisibleCards].map(card => card.querySelector('.data-video')).filter(video => video?.dataset.src); }
function setDataStatus(text) { if (dataStatus) dataStatus.textContent = text; }
function setDataToggleFromVideos() {
  if (!dataToggle) return;
  dataToggle.textContent = dataVideos().some(video => !video.paused && !video.ended) ? 'Pause task' : 'Play task';
}
function pauseDataVideos(videos = dataVideos()) { videos.forEach(video => stopVideo(video)); setDataToggleFromVideos(); }
function pauseDataForViewport() {
  dataUserPaused = false;
  dataVisibleCards.clear();
  pauseDataVideos();
}
function applyDataTask(taskId, autoplay = false) {
  const task = dataTasks[taskId] || dataTasks['task-a'];
  activeDataTask = taskId;
  dataLayout?.setAttribute('data-active-task', taskId);
  dataPanel?.setAttribute('aria-labelledby', `data-tab-${taskId}`);
  dataTabs.forEach(tab => {
    const active = tab.dataset.task === taskId;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  pauseDataVideos();
  let readyCount = 0;
  dataCards.forEach((card, index) => {
    const episode = task.episodes[index];
    const video = card.querySelector('.data-video');
    const error = card.querySelector('.data-error');
    const label = card.querySelector('footer span');
    card.classList.toggle('has-media', Boolean(episode?.src));
    if (label) label.textContent = episode?.label || `Episode ${String(index + 1).padStart(2, '0')}`;
    if (error) error.hidden = true;
    if (!video) return;
    stopVideo(video);
    video.removeAttribute('src');
    video.poster = episode?.poster || '';
    video.dataset.src = episode?.src || '';
    video.setAttribute('aria-label', `${task.label} ${task.title}, ${label?.textContent || `Episode ${index + 1}`}: synchronized third-person and egocentric views`);
    if (episode?.src) readyCount++;
  });
  const hasMedia = readyCount > 0;
  if (dataToggle) dataToggle.disabled = !hasMedia;
  if (dataReplayAll) dataReplayAll.disabled = !hasMedia;
  dataCards.forEach(card => { const replay = card.querySelector('.data-replay'); if (replay) replay.disabled = !card.classList.contains('has-media'); });
  setDataStatus(hasMedia ? `${task.label}: ${readyCount} episodes ready.` : 'Waiting for dataset clips.');
  if (autoplay && hasMedia && isPagePlayable() && !reduceMotion.matches) {
    dataUserPaused = false;
    playVisibleData();
  }
}
function ensureDataVideo(video) { if (video?.dataset.src && !video.getAttribute('src')) { video.src = video.dataset.src; video.load(); } }
function playDataVideo(video, message = 'Press Play to retry dataset clips.') {
  const expectedSrc = video.dataset.src || '';
  const error = video.closest('.data-card')?.querySelector('.data-error');
  if (error) error.hidden = true;
  ensureDataVideo(video);
  return requestVideoPlay(video).catch(err => {
    const currentExpected = video.dataset.src || '';
    const abortedBySwitch = err?.name === 'AbortError' || expectedSrc !== currentExpected;
    if (abortedBySwitch) return;
    if (error) error.hidden = false;
    setDataStatus(message);
  });
}
function playDataTask(reset = false, videos = dataVideos().filter(video => video.dataset.src)) {
  const playable = videos.filter(video => video?.dataset.src);
  if (!playable.length) return Promise.resolve([]);
  const plays = playable.map(video => {
    if (reset) safeSeekVideo(video, 0);
    return playDataVideo(video);
  });
  if (dataToggle) dataToggle.textContent = 'Pause task';
  return Promise.allSettled(plays).then(results => {
    setDataToggleFromVideos();
    return results;
  });
}
function playVisibleData() {
  if (!dataLayout || !isPagePlayable() || reduceMotion.matches || dataUserPaused) return Promise.resolve([]);
  return playDataTask(false, dataPlayableVideos());
}
function updateDataCardVisibility(card, visible, force = false) {
  const video = card?.querySelector('.data-video');
  if (!video) return;
  const hadCard = dataVisibleCards.has(card);
  if (visible) dataVisibleCards.add(card);
  else dataVisibleCards.delete(card);
  if (!force && visible === hadCard) {
    if (visible && video.paused && !dataUserPaused) playVisibleData();
    return;
  }
  if (visible) playVisibleData();
  else stopVideo(video);
  setDataToggleFromVideos();
}
function updateDataViewportState(force = false) {
  let visibleCount = 0;
  dataCards.forEach(card => {
    const visible = isPagePlayable() && isAutoplayVisible(card, 0.45);
    if (visible) visibleCount += 1;
    updateDataCardVisibility(card, visible, force);
  });
  if (!visibleCount) {
    dataUserPaused = false;
    dataVisibleCards.clear();
    pauseDataVideos();
  }
  if (force && !isPagePlayable()) dataUserPaused = false;
}
dataTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => applyDataTask(tab.dataset.task, true));
  tab.addEventListener('keydown', event => {
    const last = dataTabs.length - 1;
    let next = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index === last ? 0 : index + 1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = index === 0 ? last : index - 1;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = last;
    if (next !== null) { event.preventDefault(); dataTabs[next].focus(); applyDataTask(dataTabs[next].dataset.task, true); }
  });
});
dataToggle?.addEventListener('click', () => {
  const playing = dataVideos().some(video => !video.paused && !video.ended);
  if (playing) { dataUserPaused = dataVisibleCards.size > 0; pauseDataVideos(dataPlayableVideos()); }
  else { if (!isPagePlayable()) return; dataUserPaused = false; playDataTask(false, dataPlayableVideos().length ? dataPlayableVideos() : dataVideos().filter(video => video.dataset.src)); }
});
dataReplayAll?.addEventListener('click', () => { if (!isPagePlayable()) return; dataUserPaused = false; playDataTask(true, dataPlayableVideos().length ? dataPlayableVideos() : dataVideos().filter(video => video.dataset.src)); });
dataCards.forEach(card => card.querySelector('.data-replay')?.addEventListener('click', () => {
  const video = card.querySelector('.data-video');
  if (!video?.dataset.src || !isPagePlayable()) return;
  safeSeekVideo(video, 0);
  dataUserPaused = false;
  if (dataToggle) dataToggle.textContent = 'Pause task';
  playDataVideo(video, 'Press Replay to retry this dataset clip.').then(setDataToggleFromVideos);
}));

dataVideos().forEach(video => {
  video.addEventListener('error', () => {
    const error = video.closest('.data-card')?.querySelector('.data-error');
    if (error) error.hidden = false;
    setDataStatus('A dataset clip could not be loaded.');
  });
  video.addEventListener('loadeddata', () => {
    const error = video.closest('.data-card')?.querySelector('.data-error');
    if (error) error.hidden = true;
  });
  video.addEventListener('playing', () => { clearVideoLoading(video); setDataToggleFromVideos(); });
});
if (dataLayout) {
  const dataObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => updateDataCardVisibility(entry.target, entry.isIntersecting && entry.intersectionRatio >= 0.45));
  }, {threshold:[0,0.08,0.25,0.45,0.65,1]});
  dataCards.forEach(card => dataObserver.observe(card));
  addEventListener('scroll', () => updateDataViewportState(), {passive: true});
  addEventListener('resize', () => updateDataViewportState());
  dataPanel?.addEventListener('scroll', () => updateDataViewportState(), {passive: true});
  dataGrid?.addEventListener('scroll', () => updateDataViewportState(), {passive: true});
  applyDataTask(activeDataTask, false);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseMethodForViewport();
    pauseDataForViewport();
  } else {
    updateMethodViewportState(true);
    updateDataViewportState(true);
  }
});
