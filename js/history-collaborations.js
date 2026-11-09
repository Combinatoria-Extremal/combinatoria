/* Historical catalogue slices. Independent of the Members graph. */
((global) => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const COLOURS = { blue: '#60a5fa', red: '#f87171' };
  const mounted = new WeakMap();
  let instance = 0;
  const words = {
    pt: {
      title: 'Coautorias por período', start: 'Ano inicial', end: 'Ano final',
      faculty: 'Foco em um docente', all: 'Todos os docentes', clear: 'Limpar seleção',
      reset: 'Restaurar visão inicial', enlarge: 'Ampliar grafo', fit: 'Ajustar à largura',
      scope: 'Ano do registro no catálogo. Comunidade: docentes atualmente catalogados.',
      hint: 'Selecione um docente ou uma aresta. O número em cada aresta indica os artigos compartilhados no período.',
      zoomHint: 'O grafo ampliado pode ser percorrido com as barras de rolagem, as teclas de direção ou o toque.',
      description: 'Docentes atuais igualmente espaçados em um círculo, por ano de doutorado e nome. As arestas mostram coautorias no período escolhido. Use Tab e Enter para selecionar docentes ou arestas.',
      papers: n => `${n} ${n === 1 ? 'artigo' : 'artigos'}`,
      summary: (a, b, e, p) => `${a}–${b} · ${e} ${e === 1 ? 'par de coautores' : 'pares de coautores'} · ${p} ${p === 1 ? 'artigo com pelo menos dois docentes' : 'artigos com pelo menos dois docentes'}.`,
      overview: 'Explore as colaborações',
      empty: 'Nenhuma coautoria entre os docentes catalogados neste período. Experimente ampliar o intervalo.',
      noPartners: 'Este docente não tem coautorias com outros docentes catalogados no período escolhido.',
      partners: (n, p) => `${n} ${n === 1 ? 'colaborador' : 'colaboradores'} e ${p} ${p === 1 ? 'artigo distinto' : 'artigos distintos'} no período.`,
      shared: n => `${n} ${n === 1 ? 'artigo compartilhado' : 'artigos compartilhados'} no período.`,
      home: 'Página do docente', select: name => `Selecionar ${name}`,
      arxiv: 'Registro arXiv', journal: 'Registro de periódico', catalogue: 'Registro no catálogo',
      noData: 'Não há dados de docentes e artigos disponíveis para este gráfico.',
      unavailableYear: n => `${n} registro(s) sem ano válido não entram no filtro temporal.`
    },
    en: {
      title: 'Coauthorship over time', start: 'Start year', end: 'End year',
      faculty: 'Focus on a faculty member', all: 'All faculty members', clear: 'Clear selection',
      reset: 'Restore initial view', enlarge: 'Enlarge graph', fit: 'Fit to width',
      scope: 'Year of the catalogue record. Community: faculty members currently in the catalogue.',
      hint: 'Select a faculty member or an edge. The number on each edge is the number of shared papers in the selected period.',
      zoomHint: 'Explore the enlarged graph using the scrollbars, arrow keys, or touch.',
      description: 'Current faculty members equally spaced around a circle, ordered by PhD year and name. Edges show coauthorship in the selected period. Use Tab and Enter to select faculty members or edges.',
      papers: n => `${n} ${n === 1 ? 'paper' : 'papers'}`,
      summary: (a, b, e, p) => `${a}–${b} · ${e} ${e === 1 ? 'coauthor pair' : 'coauthor pairs'} · ${p} ${p === 1 ? 'paper with at least two faculty members' : 'papers with at least two faculty members'}.`,
      overview: 'Explore collaborations',
      empty: 'No coauthorship between catalogued faculty members in this period. Try a wider interval.',
      noPartners: 'This faculty member has no coauthorship with other catalogued faculty members in the selected period.',
      partners: (n, p) => `${n} ${n === 1 ? 'collaborator' : 'collaborators'} and ${p} distinct ${p === 1 ? 'paper' : 'papers'} in this period.`,
      shared: n => `${n} shared ${n === 1 ? 'paper' : 'papers'} in this period.`,
      home: 'Faculty homepage', select: name => `Select ${name}`,
      arxiv: 'arXiv record', journal: 'Journal record', catalogue: 'Catalogue record',
      noData: 'No faculty and paper data are available for this graph.',
      unavailableYear: n => `${n} record(s) without a valid year are excluded from the time filter.`
    }
  };

  // Pure aggregation: each paper ID contributes at most once to each unordered pair.
  // The publication year is the catalogue field, not a reconstructed employment date.
  function buildGraph(data, first = -Infinity, last = Infinity) {
    const nodes = Array.from(new Map((data.faculty || []).filter(n => n && n.id && n.name)
      .map(n => [n.id, { ...n }])).values()).sort((a, b) =>
      (Number(a.phdYear) || Infinity) - (Number(b.phdYear) || Infinity) || a.name.localeCompare(b.name, 'pt'));
    const ids = new Set(nodes.map(n => n.id));
    const seen = new Set();
    const edges = new Map();
    const papers = [];
    const years = new Set();
    let missingYears = 0;
    for (const paper of data.papers || []) {
      if (!paper || !paper.id || seen.has(paper.id)) continue;
      seen.add(paper.id);
      const year = Number(paper.year);
      if (!Number.isInteger(year) || year < 1 || year > 9999) { missingYears++; continue; }
      years.add(year);
      if (year < first || year > last) continue;
      const members = [...new Set([
        ...(Array.isArray(paper.faculty) ? paper.faculty : []),
        ...(Array.isArray(paper.authors) ? paper.authors.map(a => a && a.facultyId) : [])
      ].filter(id => ids.has(id)))].sort();
      if (members.length < 2) continue;
      papers.push({ ...paper, year, faculty: members });
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const key = JSON.stringify([members[i], members[j]]);
          if (!edges.has(key)) edges.set(key, { key, source: members[i], target: members[j], weight: 0, papers: [] });
          const edge = edges.get(key);
          edge.weight++;
          edge.papers.push(paper.id);
        }
      }
    }
    const ordered = [...edges.values()].sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target));
    return { nodes, edges: ordered, papers, years: [...years].sort((a, b) => a - b), missingYears,
      maxWeight: ordered.reduce((max, edge) => Math.max(max, edge.weight), 0) };
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function svg(tag, attributes, text) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attributes || {}).forEach(([name, value]) => node.setAttribute(name, value));
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function link(text, value) {
    try {
      const url = new URL(value, global.location.href);
      if (value && /^https?:$/.test(url.protocol)) {
        const anchor = element('a', text);
        anchor.href = url.href;
        return anchor;
      }
    } catch (_) { /* A missing or unsupported URL is shown as plain text. */ }
    return element('span', text);
  }
  function splitName(name) {
    if (name.length <= 22) return [name];
    const parts = name.split(' ');
    let split = 1, distance = Infinity;
    for (let i = 1; i < parts.length; i++) {
      const difference = Math.abs(parts.slice(0, i).join(' ').length - parts.slice(i).join(' ').length);
      if (difference < distance) { split = i; distance = difference; }
    }
    return [parts.slice(0, split).join(' '), parts.slice(split).join(' ')];
  }

  // Same radial curve construction as the Members graph, with stable node positions.
  function curvedEdge(from, to) {
    const r2 = 330 * 330, ax = from.x - 550, ay = from.y - 470;
    const dx = to.x - from.x, dy = to.y - from.y;
    function pointAt(t) {
      const x = ax + t * dx, y = ay + t * dy, q = (x * x + y * y) / r2;
      const scale = .8 + .2 * q ** 20, derivative = 8 * q ** 19 * (x * dx + y * dy) / r2;
      return { x: 550 + scale * x, y: 470 + scale * y, dx: scale * dx + derivative * x, dy: scale * dy + derivative * y };
    }
    const n = value => Number(value.toFixed(4));
    const path = [`M ${n(from.x)} ${n(from.y)}`];
    function segment(t0, p0, t1, p1, depth) {
      const step = (t1 - t0) / 3;
      const c1 = { x: p0.x + step * p0.dx, y: p0.y + step * p0.dy };
      const c2 = { x: p1.x - step * p1.dx, y: p1.y - step * p1.dy };
      const split = [.25, .5, .75].some(t => {
        const u = 1 - t, actual = pointAt(t0 + t * (t1 - t0));
        const x = u ** 3 * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * p1.x;
        const y = u ** 3 * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * p1.y;
        return Math.hypot(x - actual.x, y - actual.y) > .02;
      });
      if (split && depth < 12) {
        const middle = (t0 + t1) / 2, point = pointAt(middle);
        segment(t0, p0, middle, point, depth + 1);
        segment(middle, point, t1, p1, depth + 1);
      } else path.push(`C ${n(c1.x)} ${n(c1.y)}, ${n(c2.x)} ${n(c2.y)}, ${n(p1.x)} ${n(p1.y)}`);
    }
    segment(0, pointAt(0), 1, pointAt(1), 0);
    const middle = pointAt(.5);
    return { path: path.join(' '), x: middle.x, y: middle.y };
  }

  function mount(container, data, lang = 'pt') {
    if (!container || typeof container.replaceChildren !== 'function') throw new TypeError('A container element is required.');
    if (!data || !Array.isArray(data.faculty) || !Array.isArray(data.papers)) throw new TypeError('Faculty and paper arrays are required.');
    if (mounted.has(container)) mounted.get(container).destroy();
    const t = words[lang === 'en' ? 'en' : 'pt'];
    const uid = `history-collaborations-${++instance}`;
    const full = buildGraph(data);
    const root = element('div', undefined, 'history-collaborations');
    container.replaceChildren(root);
    let destroyed = false, observer;
    const emptyApi = { destroy() { destroyed = true; root.remove(); mounted.delete(container); } };
    if (!full.nodes.length || !full.years.length) {
      root.append(element('p', t.noData));
      mounted.set(container, emptyApi);
      return emptyApi;
    }
    const minYear = full.years[0], maxYear = full.years[full.years.length - 1];
    let first = minYear, last = maxYear, graph = full, selection = null, hovered = null, zoomed = false;
    const nodes = new Map(), nodeViews = new Map(), edgeViews = new Map();
    const anchor = Math.max(0, full.nodes.findIndex(n => n.id === 'marcelo-campos'));
    full.nodes.forEach((node, i) => {
      const angle = -Math.PI / 2 + 2 * Math.PI * i / full.nodes.length;
      nodes.set(node.id, { ...node, angle, x: 550 + 330 * Math.cos(angle), y: 470 + 330 * Math.sin(angle),
        colour: (i - anchor + full.nodes.length) % full.nodes.length % 2 === 0 ? 'red' : 'blue' });
    });

    const scope = element('p', t.scope, 'hc-scope');
    scope.id = `${uid}-scope`;
    const controls = element('div', undefined, 'hc-controls');
    function labelled(text, control, className = '') {
      const label = element('label', undefined, className);
      label.append(element('span', text), control);
      controls.append(label);
      return label;
    }
    const start = element('select');
    const end = element('select');
    for (let year = minYear; year <= maxYear; year++) {
      [start, end].forEach(control => {
        const option = element('option', String(year));
        option.value = String(year);
        control.append(option);
      });
    }
    start.value = String(first); end.value = String(last);
    labelled(t.start, start); labelled(t.end, end);
    const faculty = element('select');
    const all = element('option', t.all); all.value = ''; faculty.append(all);
    [...nodes.values()].sort((a, b) => a.name.localeCompare(b.name, lang)).forEach(node => {
      const option = element('option', node.name); option.value = node.id; faculty.append(option);
    });
    labelled(t.faculty, faculty, 'hc-faculty-filter');
    function button(text, action) {
      const control = element('button', text); control.type = 'button';
      control.addEventListener('click', action); return control;
    }
    const actions = element('div', undefined, 'hc-actions');
    const clear = button(t.clear, () => choose(null));
    const reset = button(t.reset, restore);
    const zoom = button(t.enlarge, toggleZoom);
    zoom.setAttribute('aria-pressed', 'false');
    actions.append(clear, reset, zoom);
    const summary = element('p', undefined, 'hc-summary');
    summary.setAttribute('role', 'status'); summary.setAttribute('aria-live', 'polite'); summary.setAttribute('aria-atomic', 'true');
    const hint = element('p', t.hint, 'hc-hint');
    const zoomHint = element('p', t.zoomHint, 'hc-hint'); zoomHint.hidden = true;
    const empty = element('p', t.empty, 'hc-empty');
    const viewport = element('div', undefined, 'hc-viewport');
    viewport.tabIndex = 0; viewport.setAttribute('role', 'region'); viewport.setAttribute('aria-label', t.title);
    viewport.setAttribute('aria-describedby', scope.id);
    const chart = svg('svg', { viewBox: '-120 30 1340 880', class: 'hc-svg', role: 'group',
      'aria-labelledby': `${uid}-title ${uid}-description` });
    chart.append(svg('title', { id: `${uid}-title` }, t.title), svg('desc', { id: `${uid}-description` }, t.description));
    const defs = svg('defs'), edgeLayer = svg('g'), labelLayer = svg('g', { 'aria-hidden': 'true' }), nodeLayer = svg('g');
    chart.append(defs, svg('circle', { cx: 550, cy: 470, r: 330, class: 'hc-ring', 'aria-hidden': 'true' }), edgeLayer, labelLayer, nodeLayer);
    viewport.append(chart);
    const detail = element('div', undefined, 'hc-detail');
    root.append(scope, controls, actions, summary, hint, zoomHint, empty, viewport, detail);
    if (full.missingYears) root.append(element('p', t.unavailableYear(full.missingYears), 'hc-scope'));

    function interaction(target, kind, id, accessible = true) {
      if (accessible) {
        target.setAttribute('role', 'button'); target.setAttribute('tabindex', '0'); target.setAttribute('aria-pressed', 'false');
        target.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
        });
      }
      function activate() { choose(selection && selection.kind === kind && selection.id === id ? null : { kind, id }); }
      target.addEventListener('click', activate);
      target.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { hovered = { kind, id }; paint(); } });
      target.addEventListener('pointerleave', () => { hovered = null; paint(); });
      target.addEventListener('focus', () => { hovered = { kind, id }; paint(); });
      target.addEventListener('blur', () => { hovered = null; paint(); });
    }
    function paint() {
      const active = hovered || selection, adjacent = new Set(active && active.kind === 'node' ? [active.id] : []);
      graph.edges.forEach(edge => {
        const highlight = Boolean(active && (active.kind === 'edge' ? edge.key === active.id : edge.source === active.id || edge.target === active.id));
        if (highlight) { adjacent.add(edge.source); adjacent.add(edge.target); }
        const view = edgeViews.get(edge.key);
        if (!view) return; // A focused edge can blur while a new period is rendering.
        [view.group, view.badge].forEach(node => {
          node.classList.toggle('is-muted', Boolean(active && !highlight));
          node.classList.toggle('is-highlighted', highlight);
        });
        view.group.setAttribute('aria-pressed', String(Boolean(selection && selection.kind === 'edge' && selection.id === edge.key)));
      });
      nodeViews.forEach((view, id) => {
        view.classList.toggle('is-muted', Boolean(active && !adjacent.has(id)));
        view.classList.toggle('is-selected', Boolean(selection && selection.kind === 'node' && selection.id === id));
        view.setAttribute('aria-pressed', String(Boolean(selection && selection.kind === 'node' && selection.id === id)));
      });
      clear.disabled = !selection;
      reset.disabled = first === minYear && last === maxYear && !selection && !zoomed;
    }
    function heading(text) {
      const title = element('h3', text); title.setAttribute('aria-live', 'polite');
      title.tabIndex = -1;
      detail.replaceChildren(title);
    }
    function showDetails() {
      if (!selection) {
        heading(t.overview);
        detail.append(element('p', graph.edges.length ? t.hint : t.empty));
        return;
      }
      if (selection.kind === 'node') {
        const node = nodes.get(selection.id);
        const incident = graph.edges.filter(edge => edge.source === node.id || edge.target === node.id)
          .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));
        heading([node.name, node.affiliation].filter(Boolean).join(' · '));
        const home = element('p'); home.append(link(t.home, node.url)); detail.append(home);
        const paperIds = new Set(incident.flatMap(edge => edge.papers));
        detail.append(element('p', incident.length ? t.partners(incident.length, paperIds.size) : t.noPartners));
        const list = element('ul', undefined, 'hc-partners');
        incident.forEach(edge => {
          const other = nodes.get(edge.source === node.id ? edge.target : edge.source);
          const item = element('li'); item.append(button(`${other.name} · ${t.papers(edge.weight)}`, () => choose({ kind: 'edge', id: edge.key })));
          list.append(item);
        });
        detail.append(list);
      } else {
        const edge = graph.edges.find(e => e.key === selection.id);
        heading(`${nodes.get(edge.source).name} · ${nodes.get(edge.target).name}`);
        detail.append(element('p', t.shared(edge.weight)));
        const paperMap = new Map(graph.papers.map(p => [p.id, p])), list = element('ol', undefined, 'hc-papers');
        edge.papers.map(id => paperMap.get(id)).sort((a, b) => b.year - a.year || a.title.localeCompare(b.title, lang)).forEach(paper => {
          const item = element('li'); item.append(link(paper.title, paper.url));
          const authors = (paper.authors || []).map(a => typeof a === 'string' ? a : a.name).filter(Boolean).join(', ');
          const kind = paper.type === 'arxiv' ? t.arxiv : paper.type === 'journal' ? t.journal : t.catalogue;
          item.append(element('span', [paper.year, kind, authors].filter(Boolean).join(' · '), 'hc-paper-meta'));
          list.append(item);
        });
        detail.append(list);
      }
    }
    function choose(value) {
      const replaceFocusedControl = detail.contains(document.activeElement);
      selection = value; hovered = null;
      faculty.value = selection && selection.kind === 'node' ? selection.id : '';
      showDetails(); paint();
      if (replaceFocusedControl) detail.querySelector('h3').focus({ preventScroll: true });
    }
    function renderEdges() {
      defs.replaceChildren(); edgeLayer.replaceChildren(); labelLayer.replaceChildren(); edgeViews.clear();
      graph.edges.forEach((edge, index) => {
        const from = nodes.get(edge.source), to = nodes.get(edge.target), curve = curvedEdge(from, to);
        let stroke = COLOURS[from.colour];
        if (from.colour !== to.colour) {
          const id = `${uid}-gradient-${index}`;
          const gradient = svg('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: from.x, y1: from.y, x2: to.x, y2: to.y });
          gradient.append(svg('stop', { offset: '0%', 'stop-color': COLOURS[from.colour] }), svg('stop', { offset: '100%', 'stop-color': COLOURS[to.colour] }));
          defs.append(gradient); stroke = `url(#${id})`;
        }
        const label = `${from.name} · ${to.name}: ${t.papers(edge.weight)} (${first}–${last})`;
        const group = svg('g', { class: 'hc-edge', 'aria-label': label, 'data-source': edge.source, 'data-target': edge.target });
        group.append(svg('title', {}, label), svg('path', { d: curve.path, stroke, class: 'hc-edge-line' }), svg('path', { d: curve.path, class: 'hc-edge-hit' }));
        const width = Math.max(32, String(edge.weight).length * 14 + 12);
        const badge = svg('g', { class: 'hc-edge-label', transform: `translate(${curve.x} ${curve.y})` });
        badge.append(svg('rect', { x: -width / 2, y: -16, width, height: 32, rx: 5, class: 'hc-weight-bg' }), svg('text', { x: 0, y: 0, class: 'hc-weight' }, edge.weight));
        interaction(group, 'edge', edge.key); interaction(badge, 'edge', edge.key, false);
        edgeLayer.append(group); labelLayer.append(badge); edgeViews.set(edge.key, { group, badge });
      });
    }
    nodes.forEach(node => {
      const group = svg('g', { class: 'hc-node', 'data-node-id': node.id,
        'aria-label': `${t.select(node.name)}${node.affiliation ? ` (${node.affiliation})` : ''}` });
      group.append(svg('title', {}, [node.name, node.affiliation].filter(Boolean).join(' · ')),
        svg('circle', { cx: node.x, cy: node.y, r: 22, class: 'hc-node-hit' }),
        svg('circle', { cx: node.x, cy: node.y, r: 8, class: 'hc-node-dot' }));
      const cosine = Math.cos(node.angle), sine = Math.sin(node.angle), centre = Math.abs(cosine) < .1;
      const x = centre ? node.x : node.x + Math.sign(cosine) * 18, lines = splitName(node.name);
      const y = Math.abs(cosine) < .18 ? (sine < 0 ? node.y - 26 - 20 * lines.length : node.y + 30) : node.y - 4 - (lines.length - 1) * 10;
      const text = svg('text', { x, y, 'text-anchor': centre ? 'middle' : cosine > 0 ? 'start' : 'end', class: 'hc-node-label' });
      lines.forEach((line, i) => text.append(svg('tspan', { x, dy: i === 0 ? 0 : 20 }, line)));
      if (node.affiliation) text.append(svg('tspan', { x, dy: 23, class: 'hc-node-affiliation' }, node.affiliation));
      group.append(text); interaction(group, 'node', node.id); nodeLayer.append(group); nodeViews.set(node.id, group);
    });
    function update() {
      graph = buildGraph(data, first, last); hovered = null;
      if (selection && selection.kind === 'edge' && !graph.edges.some(e => e.key === selection.id)) selection = null;
      faculty.value = selection && selection.kind === 'node' ? selection.id : '';
      summary.textContent = t.summary(first, last, graph.edges.length, graph.papers.length);
      empty.hidden = graph.edges.length > 0;
      renderEdges(); showDetails(); paint();
    }
    function fitLabels() {
      if (destroyed || !root.isConnected) return;
      try {
        const bounds = nodeLayer.getBBox();
        if (bounds.width && bounds.height) {
          const box = `${bounds.x - 24} ${bounds.y - 24} ${bounds.width + 48} ${bounds.height + 48}`;
          if (chart.getAttribute('viewBox') !== box) chart.setAttribute('viewBox', box);
        }
      } catch (_) { /* A hidden panel will be fitted once it becomes visible. */ }
    }
    function toggleZoom() {
      zoomed = !zoomed; viewport.classList.toggle('is-zoomed', zoomed); zoomHint.hidden = !zoomed;
      zoom.textContent = zoomed ? t.fit : t.enlarge; zoom.setAttribute('aria-pressed', String(zoomed));
      viewport.scrollTop = 0; viewport.scrollLeft = zoomed ? Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2) : 0;
      paint();
    }
    function restore() {
      first = minYear; last = maxYear; start.value = String(first); end.value = String(last);
      selection = null; if (zoomed) toggleZoom(); update();
    }
    start.addEventListener('change', () => {
      first = Number(start.value); if (first > last) { last = first; end.value = String(last); } update();
    });
    end.addEventListener('change', () => {
      last = Number(end.value); if (last < first) { first = last; start.value = String(first); } update();
    });
    faculty.addEventListener('change', () => choose(faculty.value ? { kind: 'node', id: faculty.value } : null));
    root.addEventListener('keydown', event => {
      if (event.key === 'Escape' && selection) { event.preventDefault(); choose(null); }
    });
    chart.addEventListener('click', event => { if (!event.target.closest('.hc-node, .hc-edge, .hc-edge-label')) choose(null); });
    update(); fitLabels(); global.requestAnimationFrame(fitLabels);
    if (global.ResizeObserver) { observer = new global.ResizeObserver(fitLabels); observer.observe(root); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitLabels);
    const api = {
      reset: restore,
      getState: () => ({ startYear: first, endYear: last, selection: selection ? { ...selection } : null,
        edgeCount: graph.edges.length, paperCount: graph.papers.length }),
      destroy() { destroyed = true; if (observer) observer.disconnect(); root.remove(); mounted.delete(container); }
    };
    mounted.set(container, api);
    return api;
  }

  global.CommunityCollaborations = Object.freeze({ mount, buildGraph });
})(typeof window === 'undefined' ? globalThis : window);
