(() => {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ENDPOINT_COLOURS = { blue: '#60a5fa', red: '#f87171' };
  const words = {
    pt: {
      title: 'Grafo de coautorias',
      description: 'Docentes igualmente espaçados em um círculo. Cada aresta é uma coautoria; o número no seu ponto médio é a quantidade de artigos. Use Tab e Enter para selecionar docentes ou arestas.',
      papers: n => `${n} ${n === 1 ? 'artigo' : 'artigos'}`,
      overview: 'Explore as colaborações',
      summary: (n, e, p) => `${n} docentes · ${e} pares de coautores · ${p} artigos com pelo menos dois docentes deste grupo.`,
      hint: 'Selecione um docente ou uma aresta. Os artigos de cada colaboração aparecerão aqui.',
      partners: n => `${n} ${n === 1 ? 'colaborador neste conjunto de dados' : 'colaboradores neste conjunto de dados'}.`,
      noPartners: 'Não há coautorias registradas para este docente no conjunto de dados consultado.',
      homepage: 'Página do docente',
      shared: n => `${n} ${n === 1 ? 'artigo em coautoria neste conjunto de dados' : 'artigos em coautoria neste conjunto de dados'}.`,
      failure: 'Não foi possível carregar o grafo. Consulte os dados no link abaixo ou recarregue a página.',
      data: 'Consultar dados de coautoria',
      select: name => `Selecionar ${name}`
    },
    en: {
      title: 'Coauthorship graph',
      description: 'Faculty members equally spaced around a circle. Each edge is a coauthorship; the number at its midpoint is the number of papers. Use Tab and Enter to select faculty members or edges.',
      papers: n => `${n} ${n === 1 ? 'paper' : 'papers'}`,
      overview: 'Explore collaborations',
      summary: (n, e, p) => `${n} faculty members · ${e} coauthor pairs · ${p} papers with at least two faculty members from this group.`,
      hint: 'Select a faculty member or an edge. The papers for each collaboration will appear here.',
      partners: n => `${n} ${n === 1 ? 'collaborator in this dataset' : 'collaborators in this dataset'}.`,
      noPartners: 'No coauthorships are recorded for this faculty member in the dataset consulted.',
      homepage: 'Faculty homepage',
      shared: n => `${n} ${n === 1 ? 'shared paper in this dataset' : 'shared papers in this dataset'}.`,
      failure: 'The graph could not be loaded. Open the data below or reload this page.',
      data: 'View coauthorship data',
      select: name => `Select ${name}`
    }
  };

  function html(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function svg(tag, attributes, text) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes || {}).forEach(([name, value]) => element.setAttribute(name, value));
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function safeURL(value) {
    try {
      const url = new URL(value, location.href);
      return /^https?:$/.test(url.protocol) ? url.href : null;
    } catch (_) { return null; }
  }

  function link(text, url) {
    const href = safeURL(url);
    if (!href) return html('span', text);
    const anchor = html('a', text);
    anchor.href = href;
    return anchor;
  }

  function activate(element, action) {
    element.addEventListener('click', action);
    element.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        action();
      }
    });
  }

  function splitName(name) {
    if (name.length <= 22) return [name];
    const parts = name.split(' ');
    let best = 1;
    let difference = Infinity;
    for (let i = 1; i < parts.length; i++) {
      const current = Math.abs(parts.slice(0, i).join(' ').length - parts.slice(i).join(' ').length);
      if (current < difference) { best = i; difference = current; }
    }
    return [parts.slice(0, best).join(' '), parts.slice(best).join(' ')];
  }

  function curvedEdge(from, to) {
    const radiusSquared = 330 * 330;
    const ax = from.x - 550, ay = from.y - 470;
    const bx = to.x - 550, by = to.y - 470;
    const dx = bx - ax, dy = by - ay;
    // One injective radial map preserves the order of the edges at each vertex.
    // Its steeper boundary derivative turns their initial tangents towards the centre.
    function pointAt(t) {
      const x = ax + t * dx, y = ay + t * dy;
      const squaredRadius = (x * x + y * y) / radiusSquared;
      const scale = .8 + .2 * squaredRadius ** 20;
      const derivative = 8 * squaredRadius ** 19 * (x * dx + y * dy) / radiusSquared;
      return { x: 550 + scale * x, y: 470 + scale * y, dx: scale * dx + derivative * x, dy: scale * dy + derivative * y };
    }
    const number = value => Number(value.toFixed(4));
    const path = [`M ${number(from.x)} ${number(from.y)}`];
    function segment(t0, p0, t1, p1, depth) {
      const step = (t1 - t0) / 3;
      const c1 = { x: p0.x + step * p0.dx, y: p0.y + step * p0.dy };
      const c2 = { x: p1.x - step * p1.dx, y: p1.y - step * p1.dy };
      const needsSplit = [.25, .5, .75].some(t => {
        const u = 1 - t;
        const actual = pointAt(t0 + t * (t1 - t0));
        const x = u ** 3 * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * p1.x;
        const y = u ** 3 * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * p1.y;
        return Math.hypot(x - actual.x, y - actual.y) > .02;
      });
      if (needsSplit && depth < 12) {
        const middle = (t0 + t1) / 2;
        const point = pointAt(middle);
        segment(t0, p0, middle, point, depth + 1);
        segment(middle, point, t1, p1, depth + 1);
      } else {
        path.push(`C ${number(c1.x)} ${number(c1.y)}, ${number(c2.x)} ${number(c2.y)}, ${number(p1.x)} ${number(p1.y)}`);
      }
    }
    segment(0, pointAt(0), 1, pointAt(1), 0);
    const middle = pointAt(.5);
    return { path: path.join(' '), x: middle.x, y: middle.y };
  }

  async function initialise(root) {
    const lang = root.dataset.lang === 'en' ? 'en' : 'pt';
    const t = words[lang];
    const find = role => root.querySelector(`[data-role="${role}"]`);
    const status = find('status');
    let data;
    try {
      const response = await fetch(root.dataset.source);
      if (!response.ok) throw new Error('Dataset unavailable');
      data = await response.json();
      if (!Array.isArray(data.nodes) || !Array.isArray(data.edges) || !Array.isArray(data.papers)) throw new Error('Invalid dataset');
      const ids = new Set(data.nodes.map(node => node.id));
      if (!ids.has('marcelo-campos')) throw new Error('Missing colour sequence anchor');
      const paperIDs = new Set(data.papers.map(paper => paper.id));
      if (data.edges.some(edge => !ids.has(edge.source) || !ids.has(edge.target) || edge.source === edge.target || !Number.isInteger(edge.weight) || edge.weight < 1 || !Array.isArray(edge.papers) || edge.papers.length !== edge.weight || edge.papers.some(id => !paperIDs.has(id)))) throw new Error('Invalid edge');
    } catch (_) {
      status.textContent = t.failure;
      const paragraph = html('p');
      paragraph.append(link(t.data, root.dataset.source));
      status.after(paragraph);
      return;
    }

    const nodes = new Map();
    const papers = new Map(data.papers.map(paper => [paper.id, paper]));
    const edges = data.edges.map((edge, index) => ({ ...edge, key: String(index) }));
    const edgeViews = new Map();
    const nodeViews = new Map();
    const faculty = find('faculty');
    const viewport = find('viewport');
    const detail = find('detail');
    let selection = null;
    let hovered = null;

    const colourAnchor = data.nodes.findIndex(node => node.id === 'marcelo-campos');
    data.nodes.forEach((node, index) => {
      const angle = -Math.PI / 2 + 2 * Math.PI * index / data.nodes.length;
      const clockwiseOffset = (index - colourAnchor + data.nodes.length) % data.nodes.length;
      const endpointColour = clockwiseOffset % 2 === 0 ? 'red' : 'blue';
      nodes.set(node.id, { ...node, angle, endpointColour, x: 550 + 330 * Math.cos(angle), y: 470 + 330 * Math.sin(angle) });
      const option = html('option', node.name);
      option.value = node.id;
      faculty.append(option);
    });

    const chart = svg('svg', { viewBox: '65 65 990 800', class: 'cg-svg', role: 'group', 'aria-labelledby': `${root.id}-svg-title ${root.id}-svg-desc` });
    chart.append(svg('title', { id: `${root.id}-svg-title` }, t.title));
    chart.append(svg('desc', { id: `${root.id}-svg-desc` }, t.description));
    const gradients = svg('defs');
    chart.append(gradients);
    chart.append(svg('circle', { cx: 550, cy: 470, r: 330, class: 'cg-ring', 'aria-hidden': 'true' }));
    const edgeLayer = svg('g', { class: 'cg-edges' });
    const labelLayer = svg('g', { class: 'cg-edge-labels', 'aria-hidden': 'true' });
    const nodeLayer = svg('g', { class: 'cg-nodes' });
    chart.append(edgeLayer, labelLayer, nodeLayer);

    function paint() {
      const active = hovered || selection;
      const activeEdge = active && active.type === 'edge' ? edges.find(edge => edge.key === active.id) : null;
      const adjacent = new Set(active && active.type === 'node' ? [active.id] : []);
      edges.forEach(edge => {
        const highlighted = Boolean(active && (active.type === 'edge' ? edge.key === active.id : edge.source === active.id || edge.target === active.id));
        if (highlighted) { adjacent.add(edge.source); adjacent.add(edge.target); }
        const view = edgeViews.get(edge.key);
        [view.group, view.badge].forEach(element => {
          element.classList.toggle('is-muted', Boolean(active && !highlighted));
          element.classList.toggle('is-highlighted', highlighted);
        });
        view.group.setAttribute('aria-pressed', String(Boolean(selection && selection.type === 'edge' && selection.id === edge.key)));
      });
      if (activeEdge) { adjacent.add(activeEdge.source); adjacent.add(activeEdge.target); }
      nodes.forEach(node => {
        const view = nodeViews.get(node.id);
        view.classList.toggle('is-muted', Boolean(active && !adjacent.has(node.id)));
        view.classList.toggle('is-selected', Boolean(active && active.type === 'node' && active.id === node.id));
        view.setAttribute('aria-pressed', String(Boolean(selection && selection.type === 'node' && selection.id === node.id)));
      });
    }

    function heading(text) {
      detail.replaceChildren();
      const title = html('h4', text);
      title.setAttribute('aria-live', 'polite');
      detail.append(title);
    }

    function overview() {
      heading(t.overview);
      detail.append(html('p', t.summary(nodes.size, edges.length, data.papers.filter(paper => (paper.faculty || []).length >= 2).length)));
      detail.append(html('p', t.hint));
    }

    function selectNode(id) {
      selection = id ? { type: 'node', id } : null;
      hovered = null;
      faculty.value = id || '';
      if (!id) { overview(); paint(); return; }
      const node = nodes.get(id);
      const incident = edges.filter(edge => edge.source === id || edge.target === id).sort((a, b) => b.weight - a.weight);
      heading(`${node.name} · ${node.affiliation}`);
      const home = html('p');
      home.append(link(t.homepage, node.url));
      detail.append(home, html('p', incident.length ? t.partners(incident.length) : t.noPartners));
      const list = html('ul', undefined, 'cg-partners');
      incident.forEach(edge => {
        const partner = nodes.get(edge.source === id ? edge.target : edge.source);
        const button = html('button', `${partner.name} · ${t.papers(edge.weight)}`);
        button.type = 'button';
        button.addEventListener('click', () => selectEdge(edge.key));
        const item = html('li');
        item.append(button);
        list.append(item);
      });
      detail.append(list);
      paint();
    }

    function selectEdge(key) {
      const edge = edges.find(item => item.key === key);
      selection = { type: 'edge', id: key };
      hovered = null;
      faculty.value = '';
      heading(`${nodes.get(edge.source).name} · ${nodes.get(edge.target).name}`);
      detail.append(html('p', t.shared(edge.weight)));
      const list = html('ol');
      edge.papers.map(id => papers.get(id)).sort((a, b) => (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title)).forEach(paper => {
        const item = html('li');
        item.append(link(paper.title, paper.url));
        const authorNames = (paper.authors || []).map(author => typeof author === 'string' ? author : author.name).filter(Boolean);
        item.append(html('span', [paper.year, authorNames.join(', ')].filter(Boolean).join(' · '), 'cg-paper-meta'));
        list.append(item);
      });
      detail.append(list);
      paint();
    }

    function interaction(element, type, id, select) {
      activate(element, select);
      element.addEventListener('pointerenter', () => { hovered = { type, id }; paint(); });
      element.addEventListener('pointerleave', () => { hovered = null; paint(); });
      element.addEventListener('focus', () => { hovered = { type, id }; paint(); });
      element.addEventListener('blur', () => { hovered = null; paint(); });
    }

    edges.forEach(edge => {
      const from = nodes.get(edge.source);
      const to = nodes.get(edge.target);
      const curve = curvedEdge(from, to);
      const attributes = { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
      const label = `${from.name} · ${to.name}: ${t.papers(edge.weight)}`;
      const group = svg('g', { class: 'cg-edge', role: 'button', tabindex: '0', 'aria-label': label, 'aria-pressed': 'false', 'data-source': edge.source, 'data-target': edge.target });
      let stroke = ENDPOINT_COLOURS[from.endpointColour];
      if (from.endpointColour !== to.endpointColour) {
        const gradientID = `${root.id}-edge-gradient-${edge.key}`;
        const gradient = svg('linearGradient', { id: gradientID, gradientUnits: 'userSpaceOnUse', ...attributes });
        gradient.append(svg('stop', { offset: '0%', 'stop-color': ENDPOINT_COLOURS[from.endpointColour] }));
        gradient.append(svg('stop', { offset: '100%', 'stop-color': ENDPOINT_COLOURS[to.endpointColour] }));
        gradients.append(gradient);
        stroke = `url(#${gradientID})`;
      }
      group.append(svg('title', {}, label));
      group.append(svg('path', { d: curve.path, stroke, class: 'cg-edge-line' }));
      group.append(svg('path', { d: curve.path, class: 'cg-edge-hit' }));
      const x = curve.x;
      const y = curve.y;
      const width = Math.max(32, String(edge.weight).length * 15 + 10);
      const badge = svg('g', { class: 'cg-edge-label', transform: `translate(${x} ${y})` });
      badge.append(svg('rect', { x: -width / 2, y: -16, width, height: 32, rx: 4, class: 'cg-weight-bg' }));
      badge.append(svg('text', { class: 'cg-weight', x: 0, y: 0 }, edge.weight));
      interaction(group, 'edge', edge.key, () => selectEdge(edge.key));
      interaction(badge, 'edge', edge.key, () => selectEdge(edge.key));
      edgeLayer.append(group);
      labelLayer.append(badge);
      edgeViews.set(edge.key, { group, badge });
    });

    nodes.forEach(node => {
      const group = svg('g', { class: 'cg-node', role: 'button', tabindex: '0', 'aria-label': `${t.select(node.name)} (${node.affiliation})`, 'aria-pressed': 'false', 'data-node-id': node.id, 'data-endpoint-colour': node.endpointColour });
      group.append(svg('title', {}, `${node.name} (${node.affiliation}) · ${lang === 'en' ? 'PhD' : 'Doutorado'}: ${node.phdYear}`));
      group.append(svg('circle', { cx: node.x, cy: node.y, r: 20, class: 'cg-node-hit' }));
      group.append(svg('circle', { cx: node.x, cy: node.y, r: 8, class: 'cg-node-dot' }));
      const cosine = Math.cos(node.angle);
      const sine = Math.sin(node.angle);
      const centre = Math.abs(cosine) < .1;
      const nearPole = Math.abs(cosine) < .18;
      const x = centre ? node.x : node.x + Math.sign(cosine) * 18;
      const lines = splitName(node.name);
      const y = nearPole ? (sine < 0 ? node.y - 26 - 18 * lines.length : node.y + 30) : node.y - 4 - (lines.length - 1) * 9;
      const text = svg('text', { x, y, 'text-anchor': centre ? 'middle' : cosine > 0 ? 'start' : 'end', class: 'cg-node-label' });
      lines.forEach((line, index) => text.append(svg('tspan', { x, dy: index === 0 ? 0 : 18 }, line)));
      text.append(svg('tspan', { x, dy: 23, class: 'cg-node-affiliation' }, node.affiliation));
      group.append(text);
      interaction(group, 'node', node.id, () => selectNode(selection && selection.type === 'node' && selection.id === node.id ? '' : node.id));
      nodeLayer.append(group);
      nodeViews.set(node.id, group);
    });

    viewport.append(chart);

    faculty.addEventListener('change', () => selectNode(faculty.value));
    root.querySelector('[data-action="reset"]').addEventListener('click', () => {
      selectNode('');
      viewport.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });

    root.addEventListener('keydown', event => {
      if (event.key === 'Escape') selectNode('');
    });
    overview();
    root.querySelector('.cg-interactive').hidden = false;
    viewport.hidden = false;
    const bounds = nodeLayer.getBBox();
    chart.setAttribute('viewBox', `${bounds.x - 12} ${bounds.y - 12} ${bounds.width + 24} ${bounds.height + 24}`);
    viewport.style.aspectRatio = `${bounds.width + 24} / ${bounds.height + 24}`;
    status.hidden = true;
  }

  document.querySelectorAll('.coauthorship-graph').forEach(initialise);
})();
