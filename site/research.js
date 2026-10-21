(() => {
  const benchmarkHost = document.querySelector('#benchmark-content');
  const faqHost = document.querySelector('#faq-content');
  if (!benchmarkHost && !faqHost) return;

  const dataUrl = './research-data.json?v=benchmark-grid-v7';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const visibleSections = new WeakSet();
  const syncGroups = new Map();
  const groupPlayTokens = new Map();
  const peerSeeks = new WeakMap();

  const fallbackData = {
    benchmark: {
      summary: 'Benchmark figures, model scores, and policy rollouts will appear here after the paper evidence bundle is exported.',
      evaluationFigure: null,
      results: null,
      videos: {tasks: []}
    },
    faq: [
      {
        id: 'agentic-real2sim',
        question: 'What matters for Gaussian-guided agentic Real2Sim?',
        answer: 'Awaiting the appendix figure and CD table export. This panel is reserved for the paper-grounded Real2Sim ablation summary.'
      },
      {
        id: 'data-scaling',
        question: 'How does data scaling change performance?',
        answer: 'Awaiting the real-world and simulation data-scaling curves from the paper evidence bundle.'
      },
      {
        id: 'sim-reflect-real',
        question: 'Can simulation reflect real-world performance?',
        answer: 'Awaiting the benchmark correlation table from the paper evidence bundle.'
      },
      {
        id: 'mix-real-sim',
        question: 'Does mixing real and simulation data improve learning?',
        answer: 'Awaiting the mixed-data experiment table from the paper evidence bundle.'
      }
    ]
  };

  const text = value => typeof value === 'string' ? value.trim() : '';
  const number = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const list = value => Array.isArray(value) ? value : [];
  const pct = value => {
    const parsed = number(value);
    if (parsed === null) return '';
    return `${Number.isInteger(parsed) ? parsed : parsed.toFixed(1)}%`;
  };

  function modelName(value) {
    const raw = text(value);
    const lower = raw.toLowerCase();
    if (lower === 'gr00t' || lower === 'groot') return 'GR00T N1.7';
    if (lower === 'pi0.5' || lower === 'pi05' || lower === 'pi0p5' || lower === 'pi-0-5') return 'π0.5';
    if (lower === 'dp') return 'Diffusion Policy';
    return raw;
  }

  function outcomeName(value) {
    const lower = text(value).toLowerCase();
    if (lower === 'success') return 'Success';
    if (lower === 'horizon' || lower === 'timeout' || lower === 'time limit') return 'Time limit';
    if (lower === 'fail' || lower === 'failure' || lower === 'failed') return 'Failed';
    return text(value);
  }

  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined && content !== null) node.textContent = String(content);
    return node;
  }

  function emptyCard(message) {
    const card = el('div', 'research-empty');
    card.append(el('span', '', 'Content unavailable'));
    card.append(el('p', '', message));
    return card;
  }

  function setCssNumber(node, name, value) {
    const parsed = Math.max(0, Math.min(100, number(value) ?? 0));
    node.style.setProperty(name, String(parsed));
  }

  function sourceNote(source) {
    const label = text(source?.label || source?.title || source?.source);
    const detail = text(source?.detail || source?.caption || source?.page || source?.note);
    if (!label && !detail) return null;
    const note = el('p', 'research-source');
    note.textContent = [label, detail].filter(Boolean).join(' · ');
    return note;
  }

  function renderImageFrame(figure, className = '') {
    if (!figure || !text(figure.src)) return null;
    const frame = el('figure', `research-figure ${className}`.trim());
    const link = document.createElement('a');
    link.className = 'research-figure-link';
    link.href = text(figure.src);
    link.target = '_blank';
    link.rel = 'noopener';
    link.setAttribute('aria-label', `Open full-size ${text(figure.title) || 'figure'}`);
    const img = document.createElement('img');
    img.src = text(figure.src);
    img.alt = text(figure.alt) || text(figure.title) || 'Research figure';
    img.loading = 'lazy';
    link.append(img);
    frame.append(link);
    const caption = text(figure.caption || figure.note);
    if (caption) frame.append(el('figcaption', '', caption));
    return frame;
  }

  function normalizeResults(raw) {
    if (!raw) return null;
    if (Array.isArray(raw.full_task)) {
      const tasks = [
        {id: 'task_a', label: 'Task 1'},
        {id: 'task_b', label: 'Task 2'},
        {id: 'task_c', label: 'Task 3'}
      ];
      return {
        title: 'Full-task success by policy',
        metric: text(raw.table_id) || 'Benchmark results',
        unit: '%',
        tasks,
        models: raw.full_task.map((row, index) => ({
          id: text(row.id || row.model).toLowerCase().replace(/[^a-z0-9]+/g, '-') || `model-${index + 1}`,
          name: modelName(row.model) || `Model ${index + 1}`,
          note: text(row.family),
          values: row,
          mean: number(row.avg),
          highlight: text(row.model).toLowerCase().includes('gr00t')
        })),
        source: {
          label: text(raw.table_id) || 'Table 8',
          detail: text(raw.unit) || 'Success rate over 100 simulation trials per model-task pair'
        }
      };
    }
    const tasks = list(raw.tasks || raw.columns).map((task, index) => ({
      id: text(task.id || task.key) || `task-${index + 1}`,
      label: text(task.label || task.name || task.title) || `Task ${index + 1}`
    }));
    const models = list(raw.models || raw.rows || raw.series).map((model, index) => ({
      id: text(model.id || model.key) || `model-${index + 1}`,
      name: text(model.name || model.label || model.model) || `Model ${index + 1}`,
      note: text(model.note || model.description),
      values: model.values || model.results || model.scores || {},
      mean: number(model.mean ?? model.average ?? model.fullTaskSuccess),
      highlight: Boolean(model.highlight || model.best || model.primary)
    }));
    if (!tasks.length || !models.length) return null;
    return {
      title: text(raw.title) || 'Full-task success by policy',
      metric: text(raw.metric) || 'Full-task success',
      unit: text(raw.unit) || '%',
      tasks,
      models,
      source: raw.source
    };
  }

  function valueFor(model, task) {
    const values = model.values || {};
    return number(values[task.id] ?? values[task.label] ?? values[task.id?.replace(/^task-/, '')]);
  }

  function renderBenchmarkBars(results) {
    if (!results) return emptyCard('Model-level benchmark numbers are not available yet. The renderer will use the exported paper table without inventing values.');
    const card = el('section', 'research-card benchmark-results');
    const header = el('header', 'research-card-header');
    header.append(el('span', 'research-kicker', results.metric));
    header.append(el('h3', '', results.title));
    const note = sourceNote(results.source);
    if (note) header.append(note);
    card.append(header);

    const chart = el('div', 'benchmark-bar-chart');
    chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', `${results.title}. ${results.metric} in ${results.unit}.`);
    const groups = [
      ...results.tasks.map(task => ({id: task.id, label: task.label, mean: false})),
      {id: 'mean', label: 'Mean', mean: true}
    ];
    const shortName = name => {
      const lower = text(name).toLowerCase();
      if (lower.includes('diffusion')) return 'DP';
      if (lower.includes('gr00t')) return 'GR00T';
      if (lower.includes('π') || lower.includes('pi0')) return 'π0.5';
      return text(name).replace('DiT4DiT', 'DiT').slice(0, 8);
    };
    const width = 980;
    const height = 300;
    const pad = {left: 58, right: 30, top: 28, bottom: 58};
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const groupW = plotW / groups.length;
    const barW = 23;
    const barGap = 8;
    const palette = ['#637b91', '#71b7d9', '#aebc9c', '#b8a4c7'];
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('benchmark-svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${results.title}: ${groups.map(group => group.label).join(', ')}.`);
    const ns = svg.namespaceURI;
    const add = (tag, attrs = {}, content = '') => {
      const node = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
      if (content !== '') node.textContent = content;
      svg.append(node);
      return node;
    };
    [0, 25, 50, 75, 100].forEach(tick => {
      const y = pad.top + plotH - tick / 100 * plotH;
      add('line', {class: 'benchmark-grid-line', x1: pad.left, x2: width - pad.right, y1: y, y2: y});
      add('text', {class: 'benchmark-y-label', x: pad.left - 12, y: y + 4, 'text-anchor': 'end'}, tick);
    });
    add('line', {class: 'benchmark-axis-line', x1: pad.left, x2: width - pad.right, y1: pad.top + plotH, y2: pad.top + plotH});
    add('line', {class: 'benchmark-axis-line', x1: pad.left, x2: pad.left, y1: pad.top, y2: pad.top + plotH});
    groups.forEach((group, groupIndex) => {
      const center = pad.left + groupIndex * groupW + groupW / 2;
      const totalBarsW = results.models.length * barW + (results.models.length - 1) * barGap;
      add('text', {class: 'benchmark-group-label', x: center, y: height - 12, 'text-anchor': 'middle'}, group.label);
      results.models.forEach((model, modelIndex) => {
        const value = group.mean ? model.mean : valueFor(model, group);
        const numeric = Math.max(0, Math.min(100, value ?? 0));
        const barH = numeric / 100 * plotH;
        const x = center - totalBarsW / 2 + modelIndex * (barW + barGap);
        const y = pad.top + plotH - barH;
        const rect = add('rect', {
          class: `benchmark-svg-bar${model.highlight ? ' is-highlight' : ''}`,
          x,
          y,
          width: barW,
          height: Math.max(2, barH),
          rx: 4,
          fill: palette[modelIndex % palette.length],
          'data-value': value === null ? '' : String(value)
        });
        const title = document.createElementNS(ns, 'title');
        title.textContent = `${group.label} ${model.name}: ${value === null ? 'not available' : pct(value)}`;
        rect.append(title);
        add('text', {class: 'benchmark-svg-value', x: x + barW / 2, y: y - 8, 'text-anchor': 'middle'}, value === null ? '—' : pct(value));
        add('text', {class: 'benchmark-svg-model', x: x + barW / 2, y: pad.top + plotH + 18, 'text-anchor': 'middle'}, shortName(model.name));
      });
    });
    const legend = document.createElementNS(ns, 'g');
    legend.setAttribute('class', 'benchmark-svg-legend');
    results.models.forEach((model, index) => {
      const x = pad.left + index * 205;
      const y = 12;
      const swatch = document.createElementNS(ns, 'rect');
      swatch.setAttribute('x', x);
      swatch.setAttribute('y', y);
      swatch.setAttribute('width', '18');
      swatch.setAttribute('height', '4');
      swatch.setAttribute('rx', '2');
      swatch.setAttribute('fill', palette[index % palette.length]);
      const label = document.createElementNS(ns, 'text');
      label.setAttribute('x', x + 25);
      label.setAttribute('y', y + 6);
      label.textContent = model.name;
      legend.append(swatch, label);
    });
    svg.append(legend);
    chart.append(svg);
    card.append(chart);
    return card;
  }

  function normalizeMediaSide(side = {}, fallbackLabel = '') {
    return {
      src: text(side.src || side.video || side.url),
      poster: text(side.poster || side.image || side.thumbnail),
      label: text(side.label || side.name) || fallbackLabel,
      outcome: text(side.outcome || side.result),
      note: text(side.note || side.caption || side.prompt)
    };
  }

  function normalizeVideoTasks(raw) {
    if (Array.isArray(raw?.records)) {
      const taskNames = {
        task1: 'Task 1 · Mobile Pick-and-Place',
        task2: 'Task 2 · Low-Reach Hat Placement',
        task3: 'Task 3 · Leg-Assisted Basket Transport'
      };
      const grouped = new Map();
      raw.records.forEach((record, index) => {
        const taskId = text(record.task) || `task${index + 1}`;
        if (!grouped.has(taskId)) {
          grouped.set(taskId, {
            id: taskId,
            title: taskNames[taskId] || taskId,
            prompt: 'Each setup keeps the initial configuration matched across policies so the rollouts compare behavior under the same scene.',
            setups: []
          });
        }
        const rowIndex = record.setup?.row_index ?? index;
        grouped.get(taskId).setups.push({
          id: `${taskId}-row-${rowIndex}`,
          label: `Setup ${String(rowIndex).padStart(3, '0')}`,
          note: 'Shared initial configuration across policies.',
          policies: list(record.models).map((model, modelIndex) => ({
            id: text(model.model).toLowerCase().replace(/[^a-z0-9]+/g, '-') || `policy-${modelIndex + 1}`,
            model: modelName(model.model) || `Policy ${modelIndex + 1}`,
            side: normalizeMediaSide({
              src: model.video,
              poster: model.poster,
              outcome: outcomeName(model.status),
              note: text(model.note)
            }, text(model.model))
          }))
        });
      });
      return [...grouped.values()].filter(task => task.setups.length);
    }
    return list(raw?.tasks || raw?.groups).map((task, taskIndex) => ({
      id: text(task.id || task.key) || `benchmark-task-${taskIndex + 1}`,
      title: text(task.title || task.name || task.label) || `Task ${taskIndex + 1}`,
      prompt: text(task.prompt || task.description),
      setups: list(task.setups || task.environments || task.cases).map((setup, setupIndex) => ({
        id: text(setup.id || setup.key) || `setup-${setupIndex + 1}`,
        label: text(setup.label || setup.title || setup.name) || `Setup ${setupIndex + 1}`,
        note: text(setup.note || setup.description || setup.environment),
        policies: list(setup.policies || setup.videos || setup.models).map((policy, policyIndex) => ({
          id: text(policy.id || policy.key) || `policy-${policyIndex + 1}`,
          model: text(policy.model || policy.name || policy.label) || `Policy ${policyIndex + 1}`,
          side: normalizeMediaSide(policy, `Policy ${policyIndex + 1}`)
        }))
      }))
    })).filter(task => task.setups.length);
  }

  function setVideoLoading(shell, isLoading) {
    const loader = shell.querySelector('.research-video-loading');
    shell.classList.toggle('is-loading', isLoading);
    if (loader) loader.hidden = !isLoading;
  }

  function mediaTile(policy, groupId) {
    const tile = el('article', 'benchmark-video-tile');
    const header = el('header', '');
    header.append(el('strong', '', policy.model));
    const outcome = text(policy.side.outcome);
    if (outcome) {
      const lower = outcome.toLowerCase();
      const className = lower.includes('success') ? 'is-success' : lower.includes('fail') ? 'is-fail' : 'is-time-limit';
      header.append(el('span', className, outcome));
    }
    const shell = el('div', 'benchmark-video-shell');
    const video = document.createElement('video');
    video.className = 'benchmark-video';
    video.controls = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'none';
    video.dataset.syncGroup = groupId;
    if (policy.side.src) video.src = policy.side.src;
    if (policy.side.poster) video.poster = policy.side.poster;
    video.setAttribute('aria-label', `${policy.model} rollout in matched benchmark setup`);
    const pending = el('div', 'benchmark-video-pending', policy.side.src ? '' : 'Video pending');
    const loading = el('div', 'research-video-loading');
    loading.hidden = true;
    loading.setAttribute('role', 'status');
    loading.innerHTML = '<span aria-hidden="true"></span><em>Loading</em>';
    shell.append(video, pending, loading);
    if (policy.side.src) tile.classList.add('has-media');
    const note = text(policy.side.note);
    tile.append(header, shell);
    if (note) tile.append(el('p', '', note));
    video.addEventListener('waiting', () => setVideoLoading(shell, true));
    video.addEventListener('canplay', () => setVideoLoading(shell, false));
    video.addEventListener('error', () => {
      setVideoLoading(shell, false);
      pending.textContent = 'Video failed to load';
      tile.classList.remove('has-media');
    });
    registerSyncVideo(video);
    return tile;
  }

  function registerSyncVideo(video) {
    const group = video.dataset.syncGroup;
    if (!group) return;
    if (!syncGroups.has(group)) syncGroups.set(group, new Set());
    syncGroups.get(group).add(video);

    video.addEventListener('play', () => syncVideos(video, 'play'));
    video.addEventListener('pause', () => {
      if (!video.ended) syncVideos(video, 'pause');
    });
    video.addEventListener('seeking', () => {
      if (!peerSeeks.has(video)) syncVideos(video, 'seek');
    });
    video.addEventListener('seeked', () => peerSeeks.delete(video));
    video.addEventListener('emptied', () => peerSeeks.delete(video));
    video.addEventListener('error', () => peerSeeks.delete(video));
  }

  function syncVideos(source, action) {
    if (source.dataset.syncing === 'true') return;
    const group = syncGroups.get(source.dataset.syncGroup);
    if (!group) return;
    if (action === 'play') {
      playReadyGroup(source, group);
      return;
    }
    currentGroupVideos(source, group).forEach(video => {
      if (video === source || !video.src) return;
      if (action === 'seek' && Number.isFinite(source.currentTime)) {
        seekPeer(video, source.currentTime);
      }
      if (action === 'pause') withSyncing(video, () => video.pause());
    });
  }

  function seekPeer(video, time) {
    const target = Math.min(time, video.duration || time);
    if (Math.abs(video.currentTime - target) < 0.01 && !video.seeking) return;
    peerSeeks.set(video, target);
    try { video.currentTime = target; } catch { peerSeeks.delete(video); }
  }

  function withSyncing(video, fn) {
    video.dataset.syncing = 'true';
    try { fn(); } finally {
      setTimeout(() => { video.dataset.syncing = 'false'; }, 120);
    }
  }

  function currentGroupVideos(source, group) {
    const activeSetup = source.closest('.benchmark-setup');
    if (!activeSetup?.classList.contains('is-active') || activeSetup.hidden) return [];
    return [...group].filter(video => video.src && video.closest('.benchmark-setup') === activeSetup);
  }

  function markGroupLoading(group, loading) {
    group.forEach(video => {
      const shell = video.closest('.benchmark-video-shell');
      if (shell) setVideoLoading(shell, loading);
    });
  }

  function canPlay(video) {
    if (!video.src) return Promise.resolve(false);
    if (video.readyState >= 3) return Promise.resolve(true);
    video.preload = 'auto';
    return new Promise(resolve => {
      const done = ok => {
        clearTimeout(timer);
        video.removeEventListener('canplay', ready);
        video.removeEventListener('canplaythrough', ready);
        video.removeEventListener('error', failed);
        resolve(ok === true && video.readyState >= 3);
      };
      const ready = () => done(true);
      const failed = () => done(false);
      const timer = setTimeout(failed, 10000);
      video.addEventListener('canplay', ready, {once: true});
      video.addEventListener('canplaythrough', ready, {once: true});
      video.addEventListener('error', failed, {once: true});
    });
  }

  async function playReadyGroup(source, group) {
    const groupId = source.dataset.syncGroup;
    const token = Symbol(groupId);
    groupPlayTokens.set(groupId, token);
    if (!isPlaybackVisible(source)) {
      source.pause();
      return;
    }
    const videos = currentGroupVideos(source, group);
    if (!videos.length) return;
    videos.forEach(video => {
      withSyncing(video, () => video.pause());
    });
    markGroupLoading(videos, true);
    const ready = await Promise.all(videos.map(canPlay));
    if (groupPlayTokens.get(groupId) !== token || !isPlaybackVisible(source) || !source.closest('.benchmark-setup')?.classList.contains('is-active')) {
      markGroupLoading(videos, false);
      return;
    }
    markGroupLoading(videos, false);
    if (!ready.every(Boolean)) return;
    const currentTime = Number.isFinite(source.currentTime) ? source.currentTime : 0;
    videos.forEach(video => {
      if (video !== source) seekPeer(video, currentTime);
    });
    await Promise.all(videos.map(video => {
      video.dataset.syncing = 'true';
      return video.play().catch(() => {}).finally(() => {
        setTimeout(() => { video.dataset.syncing = 'false'; }, 120);
      });
    }));
  }

  function pauseHiddenMedia(root = document) {
    root.querySelectorAll('video.benchmark-video').forEach(video => video.pause());
  }

  function isPlaybackVisible(source) {
    const setup = source.closest('.benchmark-setup');
    const panel = source.closest('.benchmark-video-panel');
    if (!setup || !panel || setup.hidden || panel.hidden || !setup.classList.contains('is-active')) return false;
    return intersectsViewport(source.closest('.benchmark-video-tile') || source) || intersectsViewport(setup.querySelector('.benchmark-video-grid') || setup);
  }

  function intersectsViewport(node) {
    if (!node) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const width = Math.min(rect.right, innerWidth) - Math.max(rect.left, 0);
    const height = Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0);
    return width > 40 && height > 40;
  }

  function setupHasVisibleTile(setup) {
    return [...setup.querySelectorAll('.benchmark-video-tile')].some(tile => intersectsViewport(tile));
  }

  function renderBenchmarkComposites(tasks) {
    const section = el('section', 'research-card benchmark-videos benchmark-composites');
    const header = el('header', 'research-card-header');
    header.append(el('span', 'research-kicker', 'Matched setup rollouts'));
    header.append(el('h3', '', 'Four policies. Three shared setups.'));
    header.append(el('p', '', 'Selected qualitative rollouts at original speed. Shorter runs hold their final frame.'));
    section.append(header);
    const nav = el('div', 'benchmark-task-tabs');
    nav.setAttribute('aria-label', 'Benchmark task');
    const panels = el('div', 'benchmark-video-panels');
    const players = [];

    const updateVisibility = (selectedVideo = null) => {
      players.forEach(player => {
        const {panel, video, shell} = player;
        const visible = !document.hidden && !panel.hidden && intersectsViewport(video);
        const entered = visible && !player.inView;
        player.inView = visible;
        if (!visible) {
          video.pause();
          setVideoLoading(shell, false);
          return;
        }
        if (!video.getAttribute('src')) {
          video.src = video.dataset.src;
          video.preload = 'auto';
          video.load();
        }
        if ((entered && !reducedMotion.matches) || selectedVideo === video) {
          if (video.ended || (selectedVideo === video && video.readyState >= 1)) video.currentTime = 0;
          setVideoLoading(shell, video.readyState < 3);
          video.play().catch(() => setVideoLoading(shell, false));
        }
      });
    };
    const observer = 'IntersectionObserver' in window
      ? new IntersectionObserver(updateVisibility, {threshold: [0, .1, .5]})
      : null;

    tasks.forEach((task, index) => {
      const title = text(task.title) || `Task ${index + 1}`;
      const tab = el('button', index === 0 ? 'is-active' : '', title);
      tab.type = 'button';
      tab.setAttribute('aria-pressed', String(index === 0));
      const panel = el('article', `benchmark-video-panel${index === 0 ? ' is-active' : ''}`);
      panel.id = `benchmark-composite-${index + 1}`;
      panel.hidden = index !== 0;
      tab.setAttribute('aria-controls', panel.id);
      const panelHeader = el('header', 'benchmark-video-panel-header');
      panelHeader.append(el('h4', '', title));
      if (text(task.prompt)) panelHeader.append(el('p', '', text(task.prompt)));
      const shell = el('div', 'benchmark-video-shell benchmark-composite-shell');
      const video = document.createElement('video');
      video.className = 'benchmark-video benchmark-composite-video';
      video.controls = true;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'none';
      video.dataset.src = text(task.src);
      if (text(task.poster)) video.poster = text(task.poster);
      video.setAttribute('aria-label', `${title}: four policy columns across three setup rows; outcomes shown from the start`);
      const loading = el('div', 'research-video-loading');
      loading.hidden = true;
      loading.setAttribute('role', 'status');
      loading.innerHTML = '<span aria-hidden="true"></span><em>Loading</em>';
      const error = el('p', 'benchmark-composite-error', 'Video could not load. Please refresh to retry.');
      error.hidden = true;
      shell.append(video, loading, error);
      ['waiting', 'stalled', 'seeking'].forEach(event => video.addEventListener(event, () => {
        if (!panel.hidden && intersectsViewport(video) && !video.paused) setVideoLoading(shell, true);
      }));
      ['canplay', 'playing', 'seeked', 'pause', 'ended'].forEach(event => video.addEventListener(event, () => setVideoLoading(shell, false)));
      video.addEventListener('play', () => {
        if (document.hidden || panel.hidden || !intersectsViewport(video)) video.pause();
        else if (video.readyState < 3) setVideoLoading(shell, true);
      });
      video.addEventListener('error', () => {
        setVideoLoading(shell, false);
        error.hidden = false;
      });
      panel.append(panelHeader, shell);
      players.push({panel, video, shell, inView: false});
      panels.append(panel);
      nav.append(tab);
      observer?.observe(video);
      tab.addEventListener('click', () => {
        pauseHiddenMedia(panels);
        [...nav.children].forEach(button => {
          button.classList.toggle('is-active', button === tab);
          button.setAttribute('aria-pressed', String(button === tab));
        });
        [...panels.children].forEach(child => {
          child.hidden = child !== panel;
          child.classList.toggle('is-active', child === panel);
        });
        updateVisibility(video);
      });
    });
    document.addEventListener('visibilitychange', updateVisibility);
    if (!observer) window.addEventListener('scroll', updateVisibility, {passive: true});
    window.addEventListener('resize', updateVisibility, {passive: true});
    section.append(nav, panels);
    requestAnimationFrame(updateVisibility);
    return section;
  }

  function renderBenchmarkVideos(raw) {
    const composites = list(raw?.composites).filter(task => text(task.src));
    if (composites.length) return renderBenchmarkComposites(composites);
    const tasks = normalizeVideoTasks(raw);
    const section = el('section', 'research-card benchmark-videos');
    const header = el('header', 'research-card-header');
    header.append(el('span', 'research-kicker', 'Matched setup rollouts'));
    header.append(el('h3', '', 'Policy behavior under the same task setup'));
    section.append(header);
    if (!tasks.length) {
      section.append(emptyCard('Benchmark rollout clips are not available yet. When video files are present, they will be grouped by task and synchronized within each setup.'));
      return section;
    }

    const nav = el('div', 'benchmark-task-tabs');
    const panels = el('div', 'benchmark-video-panels');
    tasks.forEach((task, taskIndex) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.textContent = task.title;
      tab.className = taskIndex === 0 ? 'is-active' : '';
      tab.setAttribute('aria-controls', `benchmark-panel-${task.id}`);
      nav.append(tab);

      const panel = el('article', `benchmark-video-panel${taskIndex === 0 ? ' is-active' : ''}`);
      panel.id = `benchmark-panel-${task.id}`;
      panel.hidden = taskIndex !== 0;
      const panelHeader = el('header', 'benchmark-video-panel-header');
      panelHeader.append(el('h4', '', task.title));
      if (task.prompt) panelHeader.append(el('p', '', task.prompt));
      panel.append(panelHeader);

      const setupTabs = el('div', 'benchmark-setup-tabs');
      const setupStage = el('div', 'benchmark-setup-stage');
      task.setups.forEach((setup, setupIndex) => {
        const setupButton = document.createElement('button');
        setupButton.type = 'button';
        setupButton.textContent = setup.label;
        setupButton.className = setupIndex === 0 ? 'is-active' : '';
        setupTabs.append(setupButton);

        const setupPanel = el('div', `benchmark-setup${setupIndex === 0 ? ' is-active' : ''}`);
        setupPanel.hidden = setupIndex !== 0;
        const setupHeader = el('div', 'benchmark-setup-header');
        setupHeader.append(el('strong', '', setup.label));
        if (setup.note) setupHeader.append(el('span', '', setup.note));
        setupPanel.append(setupHeader);
        const grid = el('div', 'benchmark-video-grid');
        const groupId = `${task.id}-${setup.id}`;
        setup.policies.forEach(policy => grid.append(mediaTile(policy, groupId)));
        setupPanel.append(grid);
        setupStage.append(setupPanel);

        setupButton.addEventListener('click', () => {
          pauseHiddenMedia(panel);
          [...setupTabs.children].forEach(button => button.classList.toggle('is-active', button === setupButton));
          [...setupStage.children].forEach(child => {
            const active = child === setupPanel;
            child.hidden = !active;
            child.classList.toggle('is-active', active);
          });
        });
      });
      panel.append(setupTabs, setupStage);
      panels.append(panel);

      tab.addEventListener('click', () => {
        pauseHiddenMedia(panels);
        [...nav.children].forEach(button => button.classList.toggle('is-active', button === tab));
        [...panels.children].forEach(child => {
          const active = child === panel;
          child.hidden = !active;
          child.classList.toggle('is-active', active);
        });
      });
    });
    section.append(nav, panels);
    return section;
  }

  function renderBenchmark(data) {
    if (!benchmarkHost) return;
    benchmarkHost.replaceChildren();
    const benchmark = data?.benchmark || fallbackData.benchmark;
    const overview = benchmark.overview || {};
    const intro = el('div', 'research-intro');
    intro.append(el('p', '', text(benchmark.summary || overview.summary) || fallbackData.benchmark.summary));
    benchmarkHost.append(intro);

    const assetFigure = data?.assets?.benchmark_setup ? {
      src: data.assets.benchmark_setup.path,
      title: data.assets.benchmark_setup.label,
      caption: `${data.assets.benchmark_setup.label || 'Benchmark setup'}${data.assets.benchmark_setup.paper_page ? ` · paper page ${data.assets.benchmark_setup.paper_page}` : ''}`
    } : null;
    const figure = renderImageFrame(benchmark.evaluationFigure || benchmark.figure || benchmark.setupFigure || assetFigure, 'benchmark-setup-figure');
    if (figure) benchmarkHost.append(figure);
    else benchmarkHost.append(emptyCard('Benchmark setup figure is not available yet.'));

    benchmarkHost.append(renderBenchmarkBars(normalizeResults(benchmark.results || benchmark.modelResults || benchmark.model_results || benchmark.bars)));
    benchmarkHost.append(renderBenchmarkVideos(benchmark.videos || benchmark.clips || benchmark.rollouts));
  }

  function normalizeTable(raw) {
    if (!raw) return null;
    const rawColumns = list(raw.columns || raw.headers);
    const columns = rawColumns.map(column => ({
      key: text(column.key || column.id || column.name || column.label || column),
      label: text(column.label || column.name || column.key || column)
    }));
    const rows = list(raw.rows || raw.data).map(row => {
      if (Array.isArray(row)) return row;
      return columns.map(column => row[column.key] ?? row[column.label] ?? row[column.key.toLowerCase?.()] ?? '');
    });
    if (!columns.length || !rows.length) return null;
    return {title: text(raw.title), caption: text(raw.caption || raw.note), columns, rows, source: raw.source, emphasis: list(raw.emphasis)};
  }

  function shouldEmphasizeCell(tableData, rowIndex, column, cell) {
    return tableData.emphasis.some(rule => {
      const rowMatch = rule.row === undefined || Number(rule.row) === rowIndex;
      const columnMatch = !rule.column || text(rule.column) === column.key || text(rule.column) === column.label;
      const valueMatch = rule.value === undefined || text(rule.value) === text(cell);
      return rowMatch && columnMatch && valueMatch;
    });
  }

  function renderTable(raw) {
    const tableData = normalizeTable(raw);
    if (!tableData) return null;
    const wrap = el('figure', 'research-table-wrap');
    if (tableData.title) wrap.append(el('figcaption', 'research-table-title', tableData.title));
    const scroller = el('div', 'research-table-scroll');
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    tableData.columns.forEach(column => tr.append(el('th', '', column.label)));
    thead.append(tr);
    const tbody = document.createElement('tbody');
    tableData.rows.forEach((row, rowIndex) => {
      const rowEl = document.createElement('tr');
      row.forEach((cell, columnIndex) => {
        const td = document.createElement('td');
        if (shouldEmphasizeCell(tableData, rowIndex, tableData.columns[columnIndex], cell)) {
          td.className = 'is-emphasized';
          td.append(el('strong', '', cell ?? ''));
        } else {
          td.textContent = cell ?? '';
        }
        rowEl.append(td);
      });
      tbody.append(rowEl);
    });
    table.append(thead, tbody);
    scroller.append(table);
    wrap.append(scroller);
    if (tableData.caption) wrap.append(el('figcaption', 'research-table-caption', tableData.caption));
    const note = sourceNote(tableData.source);
    if (note) wrap.append(note);
    return wrap;
  }

  function normalizeLineChart(raw) {
    if (!raw) return null;
    const series = list(raw.series || raw.lines).map((line, index) => ({
      name: text(line.name || line.label) || `Series ${index + 1}`,
      points: list(line.points || line.data).map(point => ({
        x: number(point.x ?? point[0]),
        y: number(point.y ?? point[1])
      })).filter(point => point.x !== null && point.y !== null)
    })).filter(line => line.points.length);
    if (!series.length) return null;
    return {
      title: text(raw.title),
      xLabel: text(raw.xLabel || raw.xlabel || raw.x_axis) || 'Data scale',
      yLabel: text(raw.yLabel || raw.ylabel || raw.y_axis) || 'Success',
      unit: text(raw.unit) || '%',
      series,
      source: raw.source
    };
  }

  function renderLineChart(raw) {
    const chart = normalizeLineChart(raw);
    if (!chart) return null;
    const allPoints = chart.series.flatMap(line => line.points);
    const minX = Math.min(...allPoints.map(point => point.x));
    const maxX = Math.max(...allPoints.map(point => point.x));
    const minY = Math.min(0, Math.min(...allPoints.map(point => point.y)));
    const maxY = Math.max(100, Math.max(...allPoints.map(point => point.y)));
    const width = 520;
    const height = 280;
    const pad = {left: 54, right: 22, top: 26, bottom: 58};
    const sx = x => pad.left + ((x - minX) / (maxX - minX || 1)) * (width - pad.left - pad.right);
    const sy = y => height - pad.bottom - ((y - minY) / (maxY - minY || 1)) * (height - pad.top - pad.bottom);
    const frame = el('figure', 'research-line-chart');
    if (chart.title) frame.append(el('figcaption', 'research-chart-title', chart.title));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${chart.title || 'Line chart'}: ${chart.yLabel} over ${chart.xLabel}.`);
    const grid = document.createElementNS(svg.namespaceURI, 'g');
    grid.setAttribute('class', 'chart-grid-lines');
    [0, 25, 50, 75, 100].forEach(tick => {
      const y = sy(tick);
      const line = document.createElementNS(svg.namespaceURI, 'line');
      line.setAttribute('x1', pad.left);
      line.setAttribute('x2', width - pad.right);
      line.setAttribute('y1', y);
      line.setAttribute('y2', y);
      grid.append(line);
      const label = document.createElementNS(svg.namespaceURI, 'text');
      label.setAttribute('x', pad.left - 12);
      label.setAttribute('y', y + 4);
      label.setAttribute('text-anchor', 'end');
      label.textContent = tick;
      grid.append(label);
    });
    svg.append(grid);
    const uniqueX = [...new Set(allPoints.map(point => point.x))].sort((a, b) => a - b);
    uniqueX.forEach((tick, index) => {
      const x = sx(tick);
      const mark = document.createElementNS(svg.namespaceURI, 'line');
      mark.setAttribute('class', 'chart-x-tick');
      mark.setAttribute('x1', x);
      mark.setAttribute('x2', x);
      mark.setAttribute('y1', height - pad.bottom);
      mark.setAttribute('y2', height - pad.bottom + 5);
      svg.append(mark);
      const label = document.createElementNS(svg.namespaceURI, 'text');
      label.setAttribute('class', `chart-x-label${index % 2 ? ' is-staggered' : ''}`);
      label.setAttribute('x', x);
      label.setAttribute('y', height - pad.bottom + (index % 2 ? 32 : 18));
      label.setAttribute('text-anchor', 'middle');
      label.textContent = tick;
      svg.append(label);
    });
    chart.series.forEach((line, index) => {
      const path = document.createElementNS(svg.namespaceURI, 'path');
      path.setAttribute('class', `chart-line line-${index % 4}`);
      path.setAttribute('d', line.points.map((point, pointIndex) => `${pointIndex ? 'L' : 'M'} ${sx(point.x).toFixed(1)} ${sy(point.y).toFixed(1)}`).join(' '));
      svg.append(path);
      line.points.forEach(point => {
        const dot = document.createElementNS(svg.namespaceURI, 'circle');
        dot.setAttribute('class', `chart-dot line-${index % 4}`);
        dot.setAttribute('cx', sx(point.x));
        dot.setAttribute('cy', sy(point.y));
        dot.setAttribute('r', '4');
        const title = document.createElementNS(svg.namespaceURI, 'title');
        title.textContent = `${line.name}: ${point.y}${chart.unit} at ${point.x}`;
        dot.append(title);
        svg.append(dot);
      });
    });
    const xLabel = document.createElementNS(svg.namespaceURI, 'text');
    xLabel.setAttribute('class', 'axis-label');
    xLabel.setAttribute('x', width / 2);
    xLabel.setAttribute('y', height - 8);
    xLabel.setAttribute('text-anchor', 'middle');
    xLabel.textContent = chart.xLabel;
    svg.append(xLabel);
    const yLabel = document.createElementNS(svg.namespaceURI, 'text');
    yLabel.setAttribute('class', 'axis-label');
    yLabel.setAttribute('transform', `translate(14 ${height / 2}) rotate(-90)`);
    yLabel.setAttribute('text-anchor', 'middle');
    yLabel.textContent = chart.yLabel;
    svg.append(yLabel);
    frame.append(svg);
    const legend = el('div', 'research-chart-legend');
    chart.series.forEach((line, index) => {
      const item = el('span', `line-${index % 4}`);
      item.append(el('i', ''));
      item.append(document.createTextNode(line.name));
      legend.append(item);
    });
    frame.append(legend);
    const note = sourceNote(chart.source);
    if (note) frame.append(note);
    return frame;
  }

  function renderFaqItem(item, index) {
    const details = document.createElement('details');
    details.className = 'faq-item';
    details.id = item.id ? `faq-${item.id}` : `faq-item-${index + 1}`;
    details.open = false;
    const summary = document.createElement('summary');
    summary.append(el('span', 'faq-number', String(index + 1).padStart(2, '0')));
    summary.append(el('strong', '', text(item.question) || `Question ${index + 1}`));
    summary.append(el('i', '', '+'));
    details.append(summary);

    const body = el('div', 'faq-body');
    const answer = el('p', 'faq-answer');
    if (text(item.lead)) answer.append(el('strong', 'faq-conclusion', text(item.lead)), document.createTextNode(' '));
    answer.append(document.createTextNode(text(item.answer) || 'Evidence export pending.'));
    body.append(answer);
    const media = el('div', 'faq-media');
    if (item.gap_study && window.renderGapStudy) media.append(window.renderGapStudy(item));
    const figure = renderImageFrame(item.figure || item.image);
    if (figure) media.append(figure);
    list(item.figures).forEach(fig => {
      const frame = renderImageFrame(fig);
      if (frame) media.append(frame);
    });
    list(item.lineCharts || item.charts).forEach(chart => {
      const frame = renderLineChart(chart);
      if (frame) media.append(frame);
    });
    list(item.tables || (item.table ? [item.table] : [])).forEach(table => {
      const frame = renderTable(table);
      if (frame) media.append(frame);
    });
    if (media.children.length) body.append(media);
    if (item.analysis) body.append(el('p', 'faq-answer faq-analysis', text(item.analysis)));
    details.append(body);
    return details;
  }

  function tableFromRows(title, columns, rows, caption = '', source = null, emphasis = []) {
    return {title, columns, rows, caption, source, emphasis};
  }

  function adaptLineCharts(item) {
    const charts = [];
    if (item.real_world_scaling) {
      charts.push({
        title: 'Real-world data scaling',
        xLabel: text(item.real_world_scaling.x_label) || 'Training trajectories',
        yLabel: 'Success rate (%)',
        unit: '%',
        series: [{
          name: text(item.real_world_scaling.task) || 'Task 1',
          points: list(item.real_world_scaling.points).map(point => ({
            x: point.trajectories,
            y: point.success
          }))
        }],
        source: {label: text(item.real_world_scaling.figure_id) || 'Figure 3'}
      });
    }
    if (item.simulation_scaling) {
      const xs = list(item.simulation_scaling.x);
      charts.push({
        title: 'Simulation benchmark scaling',
        xLabel: text(item.simulation_scaling.x_label) || 'Training data',
        yLabel: 'Full-task success (%)',
        unit: '%',
        series: list(item.simulation_scaling.series).map(series => ({
          name: text(series.task || series.name),
          points: list(series.values).map((value, index) => ({x: xs[index], y: value}))
        })),
        source: {label: text(item.simulation_scaling.figure_id) || 'Figure 4'}
      });
    }
    return charts;
  }

  function adaptFaqItem(item, assets = {}) {
    const adapted = {...item};
    const id = text(item.id);
    adapted.tables = [];
    adapted.lineCharts = [...list(item.lineCharts || item.charts), ...adaptLineCharts(item)];

    if (id === 'agentic-real2sim') {
      if (!adapted.figure && assets.agentic_real2sim?.path) {
        adapted.figure = {
          src: assets.agentic_real2sim.path,
          title: assets.agentic_real2sim.label,
          caption: 'Appendix figure showing the agentic Real2Sim reconstruction comparison.'
        };
      }
      if (Array.isArray(item.cd_table)) {
        adapted.tables.push(tableFromRows(
          'Chamfer distance in interaction regions',
          [
            {key: 'method', label: 'Method'},
            {key: 'symmetric_cd_cm', label: 'Symmetric CD (cm)'}
          ],
          item.cd_table,
          'Lower is better. Symmetric CD against LiDAR ground truth.',
          {label: 'Table 3'},
          [{row: 2, column: 'symmetric_cd_cm', value: 5.517}]
        ));
      }
    }
    if (id === 'sim-real-consistency' && Array.isArray(item.sim_real_consistency_table)) {
      adapted.tables.push(tableFromRows(
        'Matched BASE Task 1 evaluation',
        [
          {key: 'test_domain', label: 'Test domain'},
          {key: 'training_data', label: 'Training data'},
          {key: 'success', label: 'Success'}
        ],
        item.sim_real_consistency_table,
        'Comparable success-rate levels across simulation and real-world evaluation under matched configurations.',
        {label: 'Table 9'},
        [
          {row: 1, column: 'success', value: '7/20'},
          {row: 3, column: 'success', value: '39/100'}
        ]
      ));
    }
    if (id === 'mixing-real-sim') {
      if (item.task_a_cotraining?.series) {
        adapted.tables.push(tableFromRows(
          'Task 1 co-training',
          [
            {key: 'data', label: 'Training data'},
            {key: 'Walk', label: 'Walk'},
            {key: 'Pick', label: 'Pick'},
            {key: 'Place', label: 'Place'}
          ],
          item.task_a_cotraining.series,
          'Stage-wise success rate (%).',
          {label: text(item.task_a_cotraining.figure_id) || 'Figure 7'},
          [
            {row: 1, column: 'Pick'},
            {row: 1, column: 'Place'},
            {row: 2, column: 'Pick'},
            {row: 2, column: 'Place'},
            {row: 3, column: 'Pick'},
            {row: 3, column: 'Place'}
          ]
        ));
      }
      if (item.detailed_cotraining?.rows) {
        adapted.tables.push(tableFromRows(
          'Cross-task co-training',
          [
            {key: 'training_data', label: 'Training data'},
            {key: 'real_sim_ratio', label: 'Real:Sim'},
            {key: 'task_a_place', label: 'Task 1 full'},
            {key: 'task_b_place', label: 'Task 2 full'},
            {key: 'task_c_place', label: 'Task 3 full'},
            {key: 'avg', label: 'Avg (%)'}
          ],
          item.detailed_cotraining.rows.map(row => ({
            ...row,
            task_a_place: row.task_a?.Place,
            task_b_place: row.task_b?.Place,
            task_c_place: row.task_c?.['Bi-Place']
          })),
          text(item.detailed_cotraining.unit),
          {label: text(item.detailed_cotraining.table_id) || 'Table 18'},
          [
            {row: 0, column: 'task_a_place'},
            {row: 0, column: 'task_b_place'},
            {row: 0, column: 'task_c_place'},
            {row: 0, column: 'avg'},
            {row: 1, column: 'task_a_place'},
            {row: 1, column: 'task_b_place'},
            {row: 1, column: 'task_c_place'},
            {row: 1, column: 'avg'}
          ]
        ));
      }
    }
    adapted.tables.push(...list(item.tables).filter(table => typeof table === 'object'));
    return adapted;
  }

  function renderFaq(data) {
    if (!faqHost) return;
    faqHost.replaceChildren();
    const items = list(data?.faq).length ? data.faq.map(item => adaptFaqItem(item, data.assets || {})) : fallbackData.faq;
    const wrap = el('div', 'faq-list');
    items.forEach((item, index) => wrap.append(renderFaqItem(item, index)));
    faqHost.append(wrap);
  }

  function watchVisibility() {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.12) {
          entry.target.classList.add('is-visible');
          visibleSections.add(entry.target);
        } else {
          visibleSections.delete(entry.target);
          if (entry.target.classList.contains('benchmark-setup')) {
            if (!setupHasVisibleTile(entry.target)) {
              entry.target.querySelectorAll('video.benchmark-video').forEach(video => video.pause());
            }
          }
        }
      });
    }, {threshold: [0, .12, .35, .65, 1]});
    document.querySelectorAll('.benchmark-results,.benchmark-setup,.research-line-chart').forEach(node => observer.observe(node));
  }

  async function loadData() {
    try {
      const response = await fetch(dataUrl, {cache: 'no-store'});
      if (!response.ok) throw new Error(`Missing ${dataUrl}`);
      const data = await response.json();
      try {
        const manifestResponse = await fetch('./media/benchmark/manifest.json', {cache: 'no-store'});
        if (manifestResponse.ok) {
          const manifest = await manifestResponse.json();
          data.benchmark = data.benchmark || {};
          data.benchmark.videos = data.benchmark.videos || manifest;
        }
      } catch {}
      return data;
    } catch (error) {
      return fallbackData;
    }
  }

  loadData().then(data => {
    renderBenchmark(data);
    renderFaq(data);
    if (!reducedMotion.matches && 'IntersectionObserver' in window) watchVisibility();
    else document.querySelectorAll('.benchmark-results,.research-line-chart').forEach(node => node.classList.add('is-visible'));
  });
})();
