(() => {
  const layout = document.querySelector('.deployment-layout');
  const host = document.querySelector('#deployment-tasks');
  if (!layout || !host) return;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const readyToPlay = typeof HTMLMediaElement === 'undefined' ? 3 : (HTMLMediaElement.HAVE_FUTURE_DATA || 3);
  const manifestUrl = layout.dataset.manifest || './media/deployment/manifest.json';
  const state = new WeakMap();
  const taskStates = new Map();
  const featureStates = new Map();
  const taskNavLinks = [...layout.querySelectorAll('.deployment-task-nav a')];

  const fallbackManifest = {
    tasks: [
      {
        id: 'task-a',
        title: 'Mobile Pick-and-Place',
        prompt: 'Walk to the table, pick up the object, and place it into the target container.',
        demos: [
          {id: 'task-a-base-01', group: 'Base', label: 'Base 01', note: 'Base footage coming soon', real: {pending: 'Real-data trained footage coming soon'}, sim: {pending: 'Sim-data trained footage coming soon'}},
          {id: 'task-a-base-02', group: 'Base', label: 'Base 02', note: 'Base footage coming soon', real: {pending: 'Real-data trained footage coming soon'}, sim: {pending: 'Sim-data trained footage coming soon'}},
          {id: 'task-a-ood-01', group: 'Generalized', label: 'Generalized 01', note: 'Generalized footage coming soon', real: {pending: 'Real-data trained footage coming soon'}, sim: {pending: 'Sim-data trained footage coming soon'}},
          {id: 'task-a-repeated-01', group: 'Uncut', label: 'Uncut pick-and-place', note: 'Uncut rollout footage coming soon', real: {pending: 'Real-data trained footage coming soon'}, sim: {pending: 'Sim-data trained footage coming soon'}, totalSuccesses: 11}
        ]
      },
      {
        id: 'task-b',
        title: 'Low-Reach Hat Placement',
        prompt: 'Squat to pick up the hat, stand up, carry it to the cabinet, and place it into the basket on the cabinet.',
        demos: [
          {id: 'task-b-base-01', group: 'Base', label: 'Base 01', note: 'Base footage coming soon', real: {pending: 'Real-data trained footage coming soon'}, sim: {pending: 'Sim-data trained footage coming soon'}},
          {id: 'task-b-base-02', group: 'Base', label: 'Base 02', note: 'Base footage coming soon', real: {pending: 'Real-data trained footage coming soon'}, sim: {pending: 'Sim-data trained footage coming soon'}},
          {id: 'task-b-ood-01', group: 'Generalized', label: 'Generalized 01', note: 'Generalized footage coming soon', real: {pending: 'Real-data trained footage coming soon'}, sim: {pending: 'Sim-data trained footage coming soon'}}
        ]
      },
      {
        id: 'task-c',
        title: 'Leg-Assisted Basket Transport',
        prompt: 'Carry the basket with both hands, close the cabinet door with the foot, and place the basket on the stool.',
        demos: [
          {id: 'task-c-base-01', group: 'Base', label: 'Base 01', note: 'Base footage coming soon', real: {pending: 'Real-data trained footage coming soon'}, sim: {pending: 'Sim-data trained footage coming soon'}},
          {id: 'task-c-ood-01', group: 'Generalized', label: 'Generalized', note: 'Generalized deployment footage pending', real: {pending: 'Real-data trained footage coming soon'}, sim: {pending: 'Sim-data trained footage coming soon'}}
        ]
      }
    ]
  };

  function setActiveTaskNav(taskId) {
    taskNavLinks.forEach(link => {
      const active = link.getAttribute('href') === `#deployment-${taskId}`;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  function clean(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function normalizeGroup(group) {
    const value = clean(group) || 'Base';
    return value.toLowerCase() === 'ood' ? 'Generalized' : value;
  }

  function sideHasMedia(side) {
    return Boolean(clean(side?.src));
  }

  function sideOutcome(side) {
    const raw = clean(side?.outcome);
    if (!raw) return '';
    const lower = raw.toLowerCase();
    if (lower === 'success') return 'Success';
    if (lower === 'fail' || lower === 'failure') return 'Failure';
    return raw;
  }

  function outcomeClass(text) {
    const lower = text.toLowerCase();
    if (lower.includes('success') || lower.includes('completed')) return 'success';
    if (lower.includes('fail')) return 'failure';
    return '';
  }

  function normalizeMarkers(markers) {
    if (!Array.isArray(markers)) return [];
    return markers.map((item, index) => {
      if (typeof item === 'number') return {time: item, count: index + 1};
      return {
        time: Number(item.time ?? item.t ?? item.seconds ?? item.at ?? 0) || 0,
        count: Number(item.count ?? item.success ?? item.value ?? index + 1) || index + 1
      };
    }).filter(item => item.time >= 0).sort((a, b) => a.time - b.time);
  }

  function normalizeSegments(segments) {
    if (!Array.isArray(segments)) return [];
    return segments.map(item => ({
      start: Number(item.start ?? item.from ?? 0) || 0,
      end: Number(item.end ?? item.to ?? Infinity) || Infinity,
      label: clean(item.label || item.speed || item.text)
    })).filter(item => item.label).sort((a, b) => a.start - b.start);
  }

  function normalizeSide(side = {}) {
    return {
      src: clean(side.src),
      poster: clean(side.poster),
      outcome: sideOutcome(side),
      duration: Number(side.duration || 0) || 0,
      label: clean(side.label),
      pending: clean(side.pending || side.placeholder),
      successMarkers: normalizeMarkers(side.successMarkers || side.success_markers || side.markers),
      speedSegments: normalizeSegments(side.speedSegments || side.speed_segments),
      speedLabel: clean(side.speedLabel || side.speed || side.playbackLabel)
    };
  }

  function normalizeDemo(demo = {}, index = 0) {
    const group = normalizeGroup(demo.group || demo.split || demo.setting);
    const id = clean(demo.id) || `demo-${index + 1}`;
    return {
      id,
      group,
      display: demo.display === 'sim-only' ? 'sim-only' : 'pair',
      label: clean(demo.label || demo.title) || `${group} ${String(index + 1).padStart(2, '0')}`,
      note: clean(demo.note || demo.prompt || demo.description),
      real: normalizeSide(demo.real || demo.realData || demo.real_data),
      sim: normalizeSide(demo.sim || demo.simData || demo.sim_data),
      totalSuccesses: Number(demo.totalSuccesses || demo.total_successes || demo.completed_rollouts || 0) || 0,
      successMarkers: normalizeMarkers(demo.successMarkers || demo.success_markers),
      speedSegments: normalizeSegments(demo.speedSegments || demo.speed_segments),
      speedLabel: clean(demo.speedLabel || demo.speed || demo.playbackLabel)
    };
  }

  function looksRepeated(demo) {
    const text = `${demo.id} ${demo.group} ${demo.label} ${demo.note}`.toLowerCase();
    return text.includes('repeated') || text.includes('uncut') || text.includes('continuous') || text.includes('11 successful') || text.includes('11-success');
  }

  function normalizeFeature(raw, task, extractedDemo = null) {
    const source = raw || extractedDemo;
    if (!source) return null;
    const side = normalizeSide(source.video || source.media || source.sim || source.real || source);
    if (!sideHasMedia(side) && extractedDemo) {
      const preferred = sideHasMedia(extractedDemo.sim) ? extractedDemo.sim : extractedDemo.real;
      Object.assign(side, preferred);
    }
    const markers = normalizeMarkers(source.successMarkers || source.success_markers || side.successMarkers || extractedDemo?.successMarkers);
    const segments = normalizeSegments(source.speedSegments || source.speed_segments || side.speedSegments || extractedDemo?.speedSegments);
    const text = `${source.note || ''} ${extractedDemo?.note || ''}`;
    const inferredTotal = Number((text.match(/(\d+)\s+successful/i) || [])[1] || 0) || 0;
    const total = Number(source.totalSuccesses || source.total_successes || source.completedRollouts || source.completed_rollouts || extractedDemo?.totalSuccesses || 0) || inferredTotal || markers.at(-1)?.count || 11;
    return {
      id: clean(source.id || extractedDemo?.id) || `${task.id}-repeated-highlight`,
      taskId: task.id,
      layout: source.layout === 'video-left' ? 'video-left' : 'video-right',
      trials: Array.isArray(source.trials) ? source.trials : [],
      counterLabel: clean(source.counterLabel) || 'successes',
      kicker: clean(source.kicker) || 'Uncut pick-and-place',
      title: clean(source.title || source.label || extractedDemo?.label) || 'Uncut pick-and-place',
      note: clean(source.subtitle || source.note || source.description || extractedDemo?.note) || 'Uncut real-world deployment with manual resets between attempts.',
      video: side,
      totalSuccesses: total,
      successMarkers: markers,
      speedSegments: segments,
      speedLabel: clean(source.speedLabel || source.speed || side.speedLabel || extractedDemo?.speedLabel) || 'Original speed'
    };
  }

  function normalizeManifest(manifest) {
    const tasks = Array.isArray(manifest?.tasks) ? manifest.tasks : [];
    if (!tasks.length) return normalizeManifest(fallbackManifest);
    return {
      tasks: tasks.map((task, index) => {
        const fallback = fallbackManifest.tasks[index] || {};
        const demos = (Array.isArray(task.demos) ? task.demos : Array.isArray(task.pairs) ? task.pairs : []).map(normalizeDemo);
        const taskId = clean(task.id) || fallback.id || `task-${index + 1}`;
        const topFeatured = manifest?.featured?.repeatedPickPlace || manifest?.featured?.repeated_pick_place || manifest?.featured;
        const topRepeated = manifest?.repeated?.pickPlace || manifest?.repeated?.pick_place || manifest?.repeated;
        const explicitFeature = task.featured || task.repeated || (topFeatured?.taskId === taskId || topFeatured?.afterTask === taskId ? topFeatured : null) || (topRepeated?.taskId === taskId || topRepeated?.afterTask === taskId ? topRepeated : null);
        const extracted = demos.find(looksRepeated);
        const feature = normalizeFeature(explicitFeature, {id: taskId}, extracted);
        const walkSource = manifest?.featured?.walkPickPlace;
        const walkFeature = walkSource && (walkSource.taskId === taskId || walkSource.afterTask === taskId)
          ? normalizeFeature(walkSource, {id: taskId}) : null;
        return {
          id: taskId,
          title: clean(task.title) || fallback.title || `Task ${index + 1}`,
          prompt: clean(task.prompt || task.description) || fallback.prompt || '',
          demos: demos.filter(demo => !feature || demo.id !== feature.id).filter(demo => !looksRepeated(demo)),
          featured: feature,
          highlights: [feature, walkFeature].filter(Boolean)
        };
      })
    };
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function groupDemos(demos) {
    const map = new Map();
    demos.forEach(demo => {
      const key = demo.group || 'Base';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(demo);
    });
    return map;
  }

  function mediaCard(kind) {
    const side = el('article', 'deployment-side');
    side.dataset.kind = kind;
    const header = el('div', 'deployment-side-header');
    header.append(el('span', `deployment-side-label ${kind === 'sim' ? 'sim' : 'real'}`, kind === 'sim' ? 'Sim-data trained' : 'Real-data trained'));
    header.append(el('span', 'deployment-outcome'));
    const media = el('div', 'deployment-media');
    const video = document.createElement('video');
    video.className = 'deployment-video';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'none';
    video.setAttribute('aria-label', kind === 'sim' ? 'Real robot deployment trained with Zero-HLM simulation data' : 'Real robot deployment trained with real demonstrations');
    const placeholder = el('div', 'deployment-placeholder', 'Video pending');
    const loading = el('div', 'deployment-loading');
    loading.hidden = true;
    loading.setAttribute('role', 'status');
    loading.setAttribute('aria-live', 'polite');
    loading.innerHTML = '<span aria-hidden="true"></span><em>Loading</em>';
    const center = el('div', 'deployment-center-result');
    const error = el('p', 'deployment-error', 'Video could not load. Replay this deployment case to retry.');
    error.hidden = true;
    media.append(video, placeholder, loading, center, error);
    const controls = el('div', 'deployment-side-controls');
    controls.append(el('span', 'timecode deployment-current', '0:00'));
    const seek = document.createElement('input');
    seek.className = 'media-seek deployment-seek';
    seek.type = 'range';
    seek.min = '0';
    seek.max = '1000';
    seek.value = '0';
    seek.disabled = true;
    seek.setAttribute('aria-label', `${kind === 'sim' ? 'Sim-data trained' : 'Real-data trained'} video timeline`);
    controls.append(seek, el('span', 'timecode deployment-duration', '0:00'));
    side.append(header, media, controls);
    return side;
  }

  function candidateButton(task, demo, index) {
    const button = document.createElement('button');
    button.className = 'deployment-candidate';
    button.type = 'button';
    button.dataset.taskId = task.id;
    button.dataset.demoId = demo.id;
    const thumb = el('span', 'deployment-thumb');
    const poster = demo.sim.poster || demo.real.poster;
    if (poster) {
      const image = document.createElement('img');
      image.src = poster;
      image.alt = '';
      image.loading = 'lazy';
      thumb.append(image);
    }
    thumb.append(el('span'));
    const copy = el('span', 'deployment-candidate-copy');
    copy.append(el('strong', '', demo.label));
    button.append(thumb, copy, el('span', 'deployment-candidate-badge', String(index + 1).padStart(2, '0')));
    return button;
  }

  function renderTask(task, index) {
    const article = el('article', 'deployment-task');
    article.id = `deployment-${task.id}`;
    article.dataset.taskId = task.id;
    article.classList.toggle('deployment-instructions', Boolean(task.instructionPair));
    const header = el('header', 'deployment-task-header');
    const copy = el('div');
    copy.append(el('p', 'deployment-task-kicker', task.instructionPair ? 'Task 1 · Object–Goal Pair' : `Task ${index + 1} · Real robot comparison`));
    copy.append(el('h3', '', task.title));
    if (task.prompt) copy.append(el('p', 'deployment-task-prompt', task.prompt));
    const count = el('div', 'deployment-task-count');
    count.append(el('strong', '', String(task.demos.length)));
    count.append(el('span', '', 'cases'));
    header.append(copy);
    if (!task.instructionPair) header.append(count);

    const stage = el('div', 'deployment-stage');
    const main = el('div', 'deployment-main');
    const selection = el('div', 'deployment-selection');
    const selectionText = el('div', 'deployment-selection-text');
    selectionText.append(el('span', 'deployment-group-pill'));
    const selectionCopy = el('span');
    selectionCopy.append(el('h4'));
    selectionCopy.append(el('p'));
    selectionText.append(selectionCopy);
    selection.append(selectionText, el('div', 'deployment-pair-status', 'Select a deployment pair.'));

    const compare = el('div', 'deployment-compare');
    compare.append(mediaCard('real'), mediaCard('sim'));
    if (task.instructionPair) {
      compare.querySelectorAll('.deployment-side').forEach((side, sideIndex) => {
        const prompt = task.instructions[sideIndex];
        side.querySelector('.deployment-side-label').textContent = `Instruction ${sideIndex + 1}`;
        side.querySelector('.deployment-side-label').className = 'deployment-side-label';
        side.querySelector('.deployment-seek').setAttribute('aria-label', `${prompt} Video timeline`);
        side.prepend(el('p', 'deployment-instruction-prompt', prompt));
      });
    }

    const controls = el('div', 'deployment-controls');
    const buttons = el('div', 'deployment-buttons');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'deployment-toggle';
    toggle.textContent = 'Play pair';
    const replay = document.createElement('button');
    replay.type = 'button';
    replay.className = 'deployment-replay';
    replay.textContent = 'Replay pair';
    buttons.append(toggle, replay);
    controls.append(buttons, el('div', 'deployment-note', 'Both videos are real robot deployments; labels indicate training data.'));
    selection.hidden = Boolean(task.instructionPair);
    main.append(selection, compare, controls);

    const playlist = el('aside', 'deployment-playlist');
    playlist.append(el('p', 'deployment-playlist-title', 'Deployment cases'));
    groupDemos(task.demos).forEach((demos, group) => {
      const groupBox = el('div', 'deployment-candidate-group');
      groupBox.append(el('p', 'deployment-candidate-heading', group));
      demos.forEach((demo, demoIndex) => groupBox.append(candidateButton(task, demo, demoIndex)));
      playlist.append(groupBox);
    });
    stage.append(main);
    if (!task.instructionPair) stage.append(playlist);
    article.append(header, stage);
    return article;
  }

  function renderFeatured(feature) {
    const article = el('article', 'deployment-featured');
    article.id = `deployment-${feature.id}`;
    article.dataset.featureId = feature.id;
    article.dataset.taskId = feature.taskId;
    article.classList.toggle('deployment-featured--video-left', feature.layout === 'video-left');
    const copy = el('div', 'deployment-featured-copy');
    copy.append(el('p', 'deployment-task-kicker', feature.kicker));
    copy.append(el('h3', '', feature.title));
    copy.append(el('p', 'deployment-task-prompt', feature.note));
    const stats = el('div', 'deployment-featured-stats');
    const counter = el('div', 'deployment-success-counter');
    counter.append(el('strong', '', '0'), el('span', '', `/ ${feature.totalSuccesses} ${feature.counterLabel}`));
    const speed = el('div', 'deployment-speed-pill', feature.speedLabel || 'Original speed');
    stats.append(counter, speed);
    if (feature.trials.length) {
      stats.append(el('span', 'deployment-trial-index', `Trial 1 / ${feature.trials.length}`), el('span', 'deployment-trial-result', 'In progress'));
    }

    const media = el('div', 'deployment-featured-media');
    const video = document.createElement('video');
    video.className = 'deployment-video deployment-featured-video';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'none';
    video.setAttribute('aria-label', feature.title);
    const placeholder = el('div', 'deployment-placeholder', 'Uncut rollout footage coming soon');
    const loading = el('div', 'deployment-loading');
    loading.hidden = true;
    loading.setAttribute('role', 'status');
    loading.innerHTML = '<span aria-hidden="true"></span><em>Loading</em>';
    const error = el('p', 'deployment-error', 'Highlight video could not load. Replay to retry.');
    error.hidden = true;
    media.append(video, placeholder, loading, error);

    const controls = el('div', 'deployment-controls deployment-featured-controls');
    const buttons = el('div', 'deployment-buttons');
    const toggle = el('button', 'deployment-toggle', 'Play highlight');
    toggle.type = 'button';
    const replay = el('button', 'deployment-replay', 'Replay highlight');
    replay.type = 'button';
    buttons.append(toggle, replay);
    const seekRow = el('div', 'deployment-featured-seek');
    seekRow.append(el('span', 'timecode deployment-current', '0:00'));
    const seek = document.createElement('input');
    seek.className = 'media-seek deployment-seek';
    seek.type = 'range';
    seek.min = '0';
    seek.max = '1000';
    seek.value = '0';
    seek.disabled = true;
    seek.setAttribute('aria-label', `${feature.title} timeline`);
    seekRow.append(seek, el('span', 'timecode deployment-duration', '0:00'));
    controls.append(buttons, seekRow);

    article.append(copy, stats, media, controls);
    return article;
  }

  function videoReady(video) {
    return (video.readyState >= readyToPlay && !video.seeking) || video.ended;
  }

  function updateSeek(video, container) {
    const duration = Number.isFinite(video.duration) && video.duration ? video.duration : Number(video.dataset.duration || 0);
    const info = state.get(video);
    if (info?.seeking) return;
    const displayTime = info?.seekCommitted ?? video.currentTime ?? 0;
    const current = duration ? Math.min(Math.max(displayTime, 0), duration) : 0;
    const seek = container.querySelector('.deployment-seek');
    const currentEl = container.querySelector('.deployment-current');
    const durationEl = container.querySelector('.deployment-duration');
    const pct = duration ? current / duration * 100 : 0;
    if (seek) {
      seek.disabled = !(Number.isFinite(video.duration) && video.duration);
      seek.value = String(Math.round(duration ? current / duration * 1000 : 0));
      seek.style.setProperty('--seek-progress', `${pct}%`);
    }
    if (currentEl) currentEl.textContent = formatTime(current);
    if (durationEl) durationEl.textContent = formatTime(duration);
  }

  function setLoading(video, show, force = false) {
    const container = video.closest('.deployment-side,.deployment-featured');
    const loading = container?.querySelector('.deployment-loading');
    if (!container || !loading) return;
    const visible = show && !video.ended && (force || video.seeking || video.readyState < readyToPlay);
    container.classList.toggle('is-buffering', visible);
    loading.hidden = !visible;
  }

  function incrementToken(video) {
    const info = state.get(video);
    if (info) info.token += 1;
    return info?.token || 0;
  }

  function stopVideo(video) {
    const info = state.get(video);
    if (info) {
      if (info.cancelReady) info.cancelReady();
      info.playRequested = false;
      info.resumeAfterSeek = false;
      info.seekCommitted = null;
      info.waitingForPartner = false;
      info.suspendedForPartner = false;
      info.manualStop = true;
      info.token += 1;
    }
    video.pause();
    setLoading(video, false);
  }

  function ensureVideo(video) {
    if (video.dataset.src && !video.getAttribute('src')) {
      video.src = video.dataset.src;
      video.load();
    }
  }

  function waitForReady(video, token) {
    ensureVideo(video);
    const info = state.get(video);
    if (info) {
      if (info.cancelReady) info.cancelReady();
      info.playRequested = true;
      info.waitingForPartner = true;
      info.manualStop = false;
    }
    setLoading(video, true, true);
    if (videoReady(video)) return Promise.resolve(video);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn(value);
      };
      const done = () => finish(resolve, video);
      const fail = () => finish(reject, new Error('media error'));
      const stale = () => finish(reject, new Error('stale batch'));
      const check = () => {
        const latest = state.get(video);
        if (!latest || latest.token !== token || latest.manualStop || (video.dataset.src || '') !== latest.expectedSrc) {
          stale();
          return;
        }
        if (videoReady(video)) done();
      };
      const cleanup = () => {
        ['loadeddata', 'canplay', 'canplaythrough', 'timeupdate', 'seeked'].forEach(type => video.removeEventListener(type, check));
        video.removeEventListener('error', fail);
        const latest = state.get(video);
        if (latest?.cancelReady === stale) latest.cancelReady = null;
      };
      const latest = state.get(video);
      if (latest) latest.cancelReady = stale;
      ['loadeddata', 'canplay', 'canplaythrough', 'timeupdate', 'seeked'].forEach(type => video.addEventListener(type, check));
      video.addEventListener('error', fail, {once: true});
      check();
    });
  }

  function batchVideos(article, reset) {
    return activeVideos(article).filter(video => reset || !video.ended);
  }

  function requestBatchPlay(article, reset = false, fromViewport = false) {
    const taskState = taskStates.get(article.dataset.taskId);
    const videos = batchVideos(article, reset);
    if (!videos.length || document.hidden || (fromViewport && reduceMotion.matches)) return;
    if (taskState) {
      taskState.batchToken = (taskState.batchToken || 0) + 1;
      taskState.pendingPlay = true;
      taskState.userPaused = false;
    }
    const batchToken = taskState?.batchToken || 0;
    videos.forEach(video => {
      const info = state.get(video);
      const container = video.closest('.deployment-side');
      container?.querySelectorAll('.deployment-outcome,.deployment-center-result').forEach(item => item.classList.remove('is-shown'));
      const error = container?.querySelector('.deployment-error');
      if (error) error.hidden = true;
      if (reset) {
        try { video.currentTime = 0; } catch {}
      }
      if (info) {
        info.token += 1;
        info.expectedSrc = video.dataset.src || '';
        info.manualStop = false;
      }
    });
    const tokens = new Map(videos.map(video => [video, state.get(video)?.token || 0]));
    videos.forEach(video => setLoading(video, true, true));
    setTaskToggle(article);
    Promise.all(videos.map(video => waitForReady(video, tokens.get(video)))).then(() => {
      const latestTask = taskStates.get(article.dataset.taskId);
      if (!latestTask || latestTask.batchToken !== batchToken || latestTask.userPaused || document.hidden) return;
      videos.forEach(video => {
        const info = state.get(video);
        if (!info || info.token !== tokens.get(video) || video.ended) return;
        info.waitingForPartner = false;
        info.suspendedForPartner = false;
        video.play().then(() => {
          const currentTask = taskStates.get(article.dataset.taskId);
          const latest = state.get(video);
          if (currentTask?.batchToken === batchToken && latest?.token === tokens.get(video)) setLoading(video, false);
        }).catch(() => {
          const currentTask = taskStates.get(article.dataset.taskId);
          const latest = state.get(video);
          if (currentTask?.batchToken === batchToken && latest?.token === tokens.get(video)) setLoading(video, false);
        });
      });
      latestTask.pendingPlay = false;
      setTaskToggle(article);
    }).catch(() => {
      const latestTask = taskStates.get(article.dataset.taskId);
      if (!latestTask || latestTask.batchToken !== batchToken) return;
      videos.forEach(video => setLoading(video, false));
      latestTask.pendingPlay = false;
      setTaskToggle(article);
    });
  }

  function applySide(side, data, task, demo, kind) {
    const video = side.querySelector('video');
    const placeholder = side.querySelector('.deployment-placeholder');
    const outcome = side.querySelector('.deployment-outcome');
    const center = side.querySelector('.deployment-center-result');
    const error = side.querySelector('.deployment-error');
    stopVideo(video);
    const info = state.get(video);
    if (info) {
      info.seeking = false;
      info.resumeAfterSeek = false;
      info.seekCommitted = null;
      info.playRequested = false;
      info.waitingForPartner = false;
      info.suspendedForPartner = false;
    }
    video.removeAttribute('src');
    video.poster = data.poster || '';
    video.dataset.src = data.src || '';
    video.dataset.duration = data.duration ? String(data.duration) : '';
    video.dataset.outcome = data.outcome || '';
    video.setAttribute('aria-label', task.instructionPair ? task.instructions[kind === 'real' ? 0 : 1] : `${task.title}, ${demo.label}: ${kind === 'sim' ? 'sim-data trained' : 'real-data trained'} real robot deployment`);
    side.classList.toggle('has-media', sideHasMedia(data));
    placeholder.textContent = sideHasMedia(data) ? '' : (data.pending || 'Footage coming soon');
    outcome.textContent = data.outcome || '';
    outcome.className = `deployment-outcome ${outcomeClass(data.outcome)}`;
    outcome.classList.remove('is-shown');
    center.textContent = data.outcome || '';
    center.className = `deployment-center-result ${outcomeClass(data.outcome)}`;
    center.classList.remove('is-shown');
    if (error) error.hidden = true;
    video.load();
    updateSeek(video, side);
  }

  function activeVideos(article) {
    return [...article.querySelectorAll('.deployment-video')].filter(video => video.dataset.src && !video.closest('.deployment-side')?.hidden);
  }

  function anyPlaying(article) {
    return activeVideos(article).some(video => !video.paused && !video.ended);
  }

  function setTaskToggle(article) {
    if (!article) return;
    const toggle = article.querySelector('.deployment-toggle');
    if (!toggle) return;
    const videos = activeVideos(article);
    const taskState = taskStates.get(article.dataset.taskId);
    toggle.disabled = !videos.length;
    const replay = article.querySelector('.deployment-replay');
    const subject = taskState?.demo?.display === 'sim-only' ? 'video' : 'pair';
    replay.disabled = !videos.length;
    replay.textContent = `Replay ${subject}`;
    toggle.textContent = `${taskState?.pendingPlay ? 'Loading' : anyPlaying(article) ? 'Pause' : 'Play'} ${subject}`;
  }

  function selectDemo(article, demo, autoplay = false) {
    const task = taskStates.get(article.dataset.taskId)?.task;
    if (!task || !demo) return;
    const taskState = taskStates.get(task.id);
    if (taskState) {
      taskState.batchToken = (taskState.batchToken || 0) + 1;
      taskState.pendingPlay = false;
      taskState.demo = demo;
    }
    article.querySelectorAll('.deployment-candidate').forEach(button => {
      const active = button.dataset.demoId === demo.id;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    article.querySelector('.deployment-group-pill').textContent = demo.group || 'Base';
    article.querySelector('.deployment-selection h4').textContent = demo.label;
    article.querySelector('.deployment-selection p').textContent = demo.note || 'Real robot comparison';
    const single = demo.display === 'sim-only';
    const realSide = article.querySelector('.deployment-side[data-kind="real"]');
    realSide.hidden = single;
    article.querySelector('.deployment-compare').classList.toggle('is-single', single);
    article.querySelector('.deployment-note').textContent = task.instructionPair
      ? 'Same model · Different instructions · Original speed'
      : single
      ? 'Real robot deployment trained with Zero-HLM simulation data.'
      : 'Both videos are real robot deployments; labels indicate training data.';
    applySide(realSide, single ? normalizeSide() : demo.real, task, demo, 'real');
    applySide(article.querySelector('.deployment-side[data-kind="sim"]'), demo.sim, task, demo, 'sim');
    const ready = activeVideos(article).length;
    article.querySelector('.deployment-pair-status').textContent = ready ? `${ready}/${single ? 1 : 2} ${single ? 'video' : 'videos'} ready` : 'Deployment videos pending';
    setTaskToggle(article);
    if (autoplay && taskState?.inView && !taskState.userPaused && !reduceMotion.matches) requestBatchPlay(article, false, true);
  }

  function playTask(article, reset = false, fromViewport = false) {
    requestBatchPlay(article, reset, fromViewport);
  }

  function pauseTask(article, userPaused) {
    const taskState = taskStates.get(article.dataset.taskId);
    if (taskState) {
      taskState.batchToken = (taskState.batchToken || 0) + 1;
      taskState.pendingPlay = false;
      if (typeof userPaused === 'boolean') taskState.userPaused = userPaused;
    }
    activeVideos(article).forEach(stopVideo);
    setTaskToggle(article);
  }

  function pausePartnersFor(video) {
    const article = video.closest('.deployment-task');
    const taskState = taskStates.get(article?.dataset.taskId);
    if (!article || !taskState || taskState.userPaused || document.hidden) return;
    taskState.batchToken = (taskState.batchToken || 0) + 1;
    taskState.pendingPlay = true;
    activeVideos(article).forEach(other => {
      if (other.ended) return;
      const info = state.get(other);
      if (info) {
        if (info.cancelReady) info.cancelReady();
        info.suspendedForPartner = true;
        info.waitingForPartner = true;
        info.playRequested = true;
        info.manualStop = false;
        info.expectedSrc = other.dataset.src || '';
      }
      other.pause();
      setLoading(other, true, true);
    });
  }

  function resumePartnerBatch(video) {
    const article = video.closest('.deployment-task');
    const taskState = taskStates.get(article?.dataset.taskId);
    if (!article || !taskState || taskState.userPaused || document.hidden) return;
    const suspended = activeVideos(article).some(item => state.get(item)?.suspendedForPartner);
    if (!suspended || !activeVideos(article).every(item => item.ended || videoReady(item))) return;
    activeVideos(article).forEach(item => {
      const info = state.get(item);
      if (info) info.suspendedForPartner = false;
    });
    requestBatchPlay(article, false, false);
  }

  function setupVideo(video) {
    state.set(video, {seeking: false, resumeAfterSeek: false, seekCommitted: null, playRequested: false, token: 0, expectedSrc: '', waitingForPartner: false, suspendedForPartner: false, manualStop: false});
    const container = video.closest('.deployment-side,.deployment-featured');
    const seek = container.querySelector('.deployment-seek');
    video.addEventListener('loadedmetadata', () => updateSeek(video, container));
    video.addEventListener('durationchange', () => updateSeek(video, container));
    video.addEventListener('timeupdate', () => {
      const info = state.get(video);
      if (!info?.seeking) updateSeek(video, container);
      updateFeatureStats(video);
    });
    ['waiting', 'stalled'].forEach(type => video.addEventListener(type, () => {
      const info = state.get(video);
      setLoading(video, Boolean(info?.playRequested), false);
      pausePartnersFor(video);
    }));
    video.addEventListener('seeking', () => {
      const info = state.get(video);
      setLoading(video, Boolean(info?.playRequested), false);
    });
    ['canplay', 'canplaythrough', 'loadeddata', 'seeked'].forEach(type => video.addEventListener(type, () => {
      if (type === 'seeked') {
        const info = state.get(video);
        if (info) info.seekCommitted = null;
      }
      const info = state.get(video);
      if (!info?.waitingForPartner && !info?.suspendedForPartner) setLoading(video, false);
      resumePartnerBatch(video);
      setTaskToggle(video.closest('.deployment-task'));
      setFeatureToggle(video.closest('.deployment-featured'));
    }));
    video.addEventListener('playing', () => {
      setLoading(video, false);
      setTaskToggle(video.closest('.deployment-task'));
      setFeatureToggle(video.closest('.deployment-featured'));
    });
    video.addEventListener('pause', () => {
      const info = state.get(video);
      if (!info?.waitingForPartner && !info?.suspendedForPartner) setLoading(video, false);
      setTaskToggle(video.closest('.deployment-task'));
      setFeatureToggle(video.closest('.deployment-featured'));
    });
    video.addEventListener('ended', () => {
      setLoading(video, false);
      setTaskToggle(video.closest('.deployment-task'));
      setFeatureToggle(video.closest('.deployment-featured'));
      updateFeatureStats(video, true);
      const outcomeText = video.dataset.outcome || '';
      if (outcomeText && container.classList.contains('deployment-side')) {
        container.querySelector('.deployment-outcome')?.classList.add('is-shown');
        container.querySelector('.deployment-center-result')?.classList.add('is-shown');
      }
    });
    video.addEventListener('error', () => {
      setLoading(video, false);
      const error = container.querySelector('.deployment-error');
      if (error) error.hidden = false;
      setTaskToggle(video.closest('.deployment-task'));
      setFeatureToggle(video.closest('.deployment-featured'));
    });
    function seekDuration() {
      return (Number.isFinite(video.duration) && video.duration) || Number(video.dataset.duration || 0);
    }
    function seekTarget() {
      const duration = seekDuration();
      return duration ? Number(seek.value) / 1000 * duration : 0;
    }
    function beginSeek() {
      if (seek.disabled) return;
      const info = state.get(video);
      if (!info || info.seeking) return;
      info.seeking = true;
      info.seekTarget = video.currentTime || 0;
      info.resumeAfterSeek = !video.paused && !video.ended;
      if (info.resumeAfterSeek) {
        const article = video.closest('.deployment-task');
        if (article) {
          const taskState = taskStates.get(article.dataset.taskId);
          if (taskState) {
            taskState.batchToken = (taskState.batchToken || 0) + 1;
            taskState.pendingPlay = false;
          }
          activeVideos(article).forEach(item => {
            if (item === video) item.pause();
            else stopVideo(item);
          });
        } else video.pause();
      }
      container.querySelectorAll('.deployment-outcome,.deployment-center-result').forEach(item => item.classList.remove('is-shown'));
    }
    function previewSeek() {
      if (seek.disabled) return;
      const duration = seekDuration();
      const target = seekTarget();
      state.get(video).seekTarget = target;
      seek.style.setProperty('--seek-progress', `${duration ? target / duration * 100 : 0}%`);
      container.querySelector('.deployment-current').textContent = formatTime(target);
      container.querySelectorAll('.deployment-outcome,.deployment-center-result').forEach(item => item.classList.remove('is-shown'));
      updateFeatureStats(video, false, target);
    }
    function endSeek() {
      const info = state.get(video);
      if (!info || !info.seeking) return;
      const target = info.seekTarget;
      const duration = seekDuration();
      const clamped = duration ? Math.min(Math.max(target, 0), duration) : Math.max(target, 0);
      info.seekCommitted = clamped;
      container.querySelector('.deployment-current').textContent = formatTime(clamped);
      if (!video.getAttribute('src')) ensureVideo(video);
      try { video.currentTime = clamped; } catch {}
      info.seeking = false;
      const article = video.closest('.deployment-task');
      if (info.resumeAfterSeek && article) requestBatchPlay(article, false, false);
      else if (info.resumeAfterSeek) video.play().catch(() => setLoading(video, false));
      info.resumeAfterSeek = false;
    }
    seek.addEventListener('pointerdown', beginSeek);
    seek.addEventListener('input', () => {
      if (!state.get(video)?.seeking) beginSeek();
      previewSeek();
    });
    seek.addEventListener('change', endSeek);
    seek.addEventListener('pointerup', endSeek);
    seek.addEventListener('pointercancel', endSeek);
    seek.addEventListener('blur', endSeek);
  }

  function setupTask(article, task) {
    taskStates.set(task.id, {task, demo: task.demos[0], inView: false, userPaused: false, batchToken: 0, pendingPlay: false});
    article.querySelectorAll('.deployment-candidate').forEach(button => {
      button.addEventListener('click', () => {
        const demo = task.demos.find(item => item.id === button.dataset.demoId);
        selectDemo(article, demo, true);
      });
    });
    article.querySelector('.deployment-toggle').addEventListener('click', () => {
      const taskState = taskStates.get(article.dataset.taskId);
      if (taskState?.pendingPlay || anyPlaying(article)) pauseTask(article, true);
      else requestBatchPlay(article);
    });
    article.querySelector('.deployment-replay').addEventListener('click', () => requestBatchPlay(article, true));
    article.querySelectorAll('.deployment-video').forEach(setupVideo);
    selectDemo(article, task.demos[0], false);
  }

  function applyFeatured(article, feature) {
    const video = article.querySelector('video');
    const placeholder = article.querySelector('.deployment-placeholder');
    const error = article.querySelector('.deployment-error');
    video.poster = feature.video.poster || '';
    video.dataset.src = feature.video.src || '';
    video.dataset.duration = feature.video.duration ? String(feature.video.duration) : '';
    article.classList.toggle('has-media', sideHasMedia(feature.video));
    placeholder.textContent = sideHasMedia(feature.video) ? '' : (feature.video.pending || 'Uncut rollout footage coming soon');
    if (error) error.hidden = true;
    video.load();
    updateSeek(video, article);
    updateFeatureStats(video, false, 0);
    setFeatureToggle(article);
  }

  function setFeatureToggle(article) {
    if (!article) return;
    const video = article.querySelector('video');
    const toggle = article.querySelector('.deployment-toggle');
    const replay = article.querySelector('.deployment-replay');
    const featureState = featureStates.get(article.dataset.featureId);
    if (!toggle || !video) return;
    toggle.disabled = !video.dataset.src;
    if (replay) replay.disabled = !video.dataset.src;
    toggle.textContent = featureState?.pendingPlay ? 'Loading highlight' : (!video.paused && !video.ended) ? 'Pause highlight' : 'Play highlight';
  }

  function featureSpeedLabel(feature, time) {
    const segment = feature.speedSegments.find(item => time >= item.start && time <= item.end);
    return segment?.label || feature.speedLabel || 'Original speed';
  }

  function trialProgress(trials, time) {
    const current = trials.filter(trial => trial.start <= time).at(-1) || trials[0];
    return {
      successes: trials.filter(trial => trial.resultAt <= time && trial.outcome === 'Success').length,
      index: trials.indexOf(current) + 1,
      outcome: time >= current.resultAt ? current.outcome : 'In progress'
    };
  }

  function updateFeatureStats(video, ended = false, timeOverride = null) {
    const article = video.closest('.deployment-featured');
    if (!article) return;
    const featureState = featureStates.get(article.dataset.featureId);
    if (!featureState) return;
    const feature = featureState.feature;
    const time = Number.isFinite(timeOverride) ? timeOverride : video.currentTime || 0;
    let count = 0;
    feature.successMarkers.forEach(marker => {
      if (time >= marker.time) count = Math.max(count, marker.count);
    });
    if (!feature.successMarkers.length && ended) count = feature.totalSuccesses;
    count = Math.min(feature.totalSuccesses, count);
    if (feature.trials.length) {
      const progress = trialProgress(feature.trials, time);
      article.querySelector('.deployment-success-counter strong').textContent = String(progress.successes);
      article.querySelector('.deployment-success-counter span').textContent = 'successes';
      article.querySelector('.deployment-trial-index').textContent = `Trial ${progress.index} / ${feature.trials.length}`;
      const result = article.querySelector('.deployment-trial-result');
      result.textContent = progress.outcome;
      result.dataset.outcome = progress.outcome;
      return;
    }
    article.querySelector('.deployment-success-counter strong').textContent = String(count);
    article.querySelector('.deployment-success-counter span').textContent = `/ ${feature.totalSuccesses} ${feature.counterLabel}`;
    article.querySelector('.deployment-speed-pill').textContent = featureSpeedLabel(feature, time);
  }

  function playFeature(article, reset = false, fromViewport = false) {
    const video = article.querySelector('video');
    const featureState = featureStates.get(article.dataset.featureId);
    if (!video?.dataset.src || !featureState || document.hidden || (fromViewport && reduceMotion.matches)) return;
    if (reset) {
      try { video.currentTime = 0; } catch {}
      updateFeatureStats(video, false, 0);
    }
    featureState.userPaused = false;
    featureState.pendingPlay = true;
    featureState.token += 1;
    const token = incrementToken(video);
    const error = article.querySelector('.deployment-error');
    if (error) error.hidden = true;
    setLoading(video, true, true);
    setFeatureToggle(article);
    const info = state.get(video);
    if (info) info.expectedSrc = video.dataset.src || '';
    waitForReady(video, token).then(() => {
      const latest = featureStates.get(article.dataset.featureId);
      if (!latest || latest.token !== featureState.token || latest.userPaused || document.hidden || video.ended) return;
      latest.pendingPlay = false;
      video.play().then(() => setLoading(video, false)).catch(() => setLoading(video, false));
      setFeatureToggle(article);
    }).catch(() => {
      featureState.pendingPlay = false;
      setLoading(video, false);
      setFeatureToggle(article);
    });
  }

  function pauseFeature(article, userPaused) {
    const featureState = featureStates.get(article.dataset.featureId);
    if (featureState) {
      featureState.token += 1;
      featureState.pendingPlay = false;
      if (typeof userPaused === 'boolean') featureState.userPaused = userPaused;
    }
    const video = article.querySelector('video');
    if (video) stopVideo(video);
    setFeatureToggle(article);
  }

  function setupFeatured(article, feature) {
    featureStates.set(feature.id, {feature, inView: false, userPaused: false, pendingPlay: false, token: 0});
    const video = article.querySelector('video');
    setupVideo(video);
    article.querySelector('.deployment-toggle').addEventListener('click', () => {
      if (!video.paused && !video.ended) pauseFeature(article, true);
      else playFeature(article);
    });
    article.querySelector('.deployment-replay').addEventListener('click', () => playFeature(article, true));
    applyFeatured(article, feature);
  }

  function updateViewport(article, force = false) {
    const taskState = taskStates.get(article.dataset.taskId);
    if (!taskState) return;
    if (document.hidden) {
      pauseTask(article);
      return;
    }
    const rect = (article.querySelector('.deployment-main') || article).getBoundingClientRect();
    const vh = innerHeight || document.documentElement.clientHeight;
    const vw = innerWidth || document.documentElement.clientWidth;
    const visibleWidth = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
    const visible = visibleWidth * visibleHeight / Math.max(1, rect.width * rect.height) >= 0.32;
    if (visible === taskState.inView && !force) return;
    taskState.inView = visible;
    if (visible) setActiveTaskNav(taskState.task.navTaskId || article.dataset.taskId);
    if (visible && !taskState.userPaused && !reduceMotion.matches) requestBatchPlay(article, false, true);
    if (!visible) pauseTask(article);
  }

  function updateFeaturedViewport(article, force = false) {
    const featureState = featureStates.get(article.dataset.featureId);
    if (!featureState) return;
    if (document.hidden) {
      pauseFeature(article);
      return;
    }
    const rect = article.querySelector('.deployment-featured-media').getBoundingClientRect();
    const vh = innerHeight || document.documentElement.clientHeight;
    const visibleHeight = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
    const visible = visibleHeight / Math.max(1, rect.height) >= 0.34;
    if (visible === featureState.inView && !force) return;
    featureState.inView = visible;
    if (visible) setActiveTaskNav(article.dataset.taskId);
    if (visible && !featureState.userPaused && !reduceMotion.matches) playFeature(article, false, true);
    if (!visible) pauseFeature(article);
  }

  function instructionComparisonTask() {
    return {
      id: 'task-a-instructions',
      navTaskId: 'task-a',
      instructionPair: true,
      title: 'Object–Goal Generalization',
      prompt: 'From banana-to-basket to bitter-melon-to-plate, the same policy follows the instructed object–goal pair. With both objects present, these real-world rollouts illustrate selecting the requested object and placement target while leaving the distractor untouched.',
      instructions: ['Place the banana in the woven basket.', 'Place the bitter melon on the white plate.'],
      demos: [normalizeDemo({
        id: 'task-a-instruction-pair',
        group: 'Language-conditioned object selection',
        label: 'Object–Goal Generalization',
        real: {src: './media/deployment/task1-instruction-banana.mp4', poster: './media/deployment/task1-instruction-banana.jpg', duration: 33},
        sim: {src: './media/deployment/task1-instruction-bitter-melon.mp4', poster: './media/deployment/task1-instruction-bitter-melon.jpg', duration: 28}
      })]
    };
  }

  function render(manifest) {
    const normalized = normalizeManifest(manifest);
    host.replaceChildren();
    const articles = [];
    const featureArticles = [];
    normalized.tasks.forEach((task, index) => {
      if (!task.demos.length) {
        const fallback = fallbackManifest.tasks[index];
        task.demos = fallback?.demos.map(normalizeDemo).filter(demo => !looksRepeated(demo)) || [];
      }
      const article = renderTask(task, index);
      host.append(article);
      setupTask(article, task);
      articles.push(article);
      task.highlights.forEach(feature => {
        const featureArticle = renderFeatured(feature);
        host.append(featureArticle);
        setupFeatured(featureArticle, feature);
        featureArticles.push(featureArticle);
      });
      if (task.id === 'task-a') {
        const comparison = instructionComparisonTask();
        const comparisonArticle = renderTask(comparison, index);
        host.append(comparisonArticle);
        setupTask(comparisonArticle, comparison);
        articles.push(comparisonArticle);
      }
    });
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => updateViewport(entry.target));
    }, {threshold: [0, .08, .32, .55, .85, 1]});
    articles.forEach(article => observer.observe(article));
    const featureObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => updateFeaturedViewport(entry.target));
    }, {threshold: [0, .1, .34, .6, 1]});
    featureArticles.forEach(article => featureObserver.observe(article));
    if (articles[0]) setActiveTaskNav(articles[0].dataset.taskId);
    taskNavLinks.forEach(link => link.addEventListener('click', () => {
      const target = (link.getAttribute('href') || '').replace('#deployment-', '');
      if (target) setActiveTaskNav(target);
    }));
    addEventListener('scroll', () => {
      articles.forEach(updateViewport);
      featureArticles.forEach(updateFeaturedViewport);
    }, {passive: true});
    addEventListener('resize', () => {
      articles.forEach(updateViewport);
      featureArticles.forEach(updateFeaturedViewport);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        articles.forEach(article => pauseTask(article));
        featureArticles.forEach(article => pauseFeature(article));
      } else {
        articles.forEach(article => updateViewport(article, true));
        featureArticles.forEach(article => updateFeaturedViewport(article, true));
      }
    });
  }

  fetch(manifestUrl, {cache: 'no-store'})
    .then(response => response.ok ? response.json() : fallbackManifest)
    .then(render)
    .catch(() => render(fallbackManifest));
})();
