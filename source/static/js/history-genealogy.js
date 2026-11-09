(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const normalise = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  const textAt = (value, lang) => typeof value === 'string' ? value : value && (value[lang] || value.pt || value.en) || '';
  const labels = {
    pt: {
      search: 'Buscar pessoa', placeholder: 'Nome ou parte do nome', searchButton: 'Buscar', degree: 'Titulações',
      phd: 'Doutorado', masters: 'Mestrado', professional: 'Mestrado profissional', all: 'Mestrado e doutorado',
      coadvisors: 'Mostrar coorientações', ancestors: 'Expandir orientadores', descendants: 'Expandir orientados', reset: 'Visão inicial',
      zoomIn: 'Ampliar', zoomOut: 'Reduzir', fit: 'Enquadrar todo o ramo', graph: 'Genealogia acadêmica',
      graphHelp: 'Arraste o fundo para deslocar o grafo. Use os botões para ampliar ou reduzir. Com o grafo em foco, as setas deslocam a visualização, + e − ajustam o zoom e Home enquadra o ramo.',
      direct: 'Orientação', co: 'Coorientação', joint: 'Orientação conjunta', institutional: 'Orientação institucional',
      member: 'Docente da comunidade', person: 'Pessoa selecionada', focus: 'Explorar este ramo',
      summary: (name, n, e) => `${name} · ${n} pessoas · ${e} vínculos exibidos`,
      selected: name => `Selecionar ${name}`, focusName: name => `Explorar o ramo de ${name}`,
      absent: 'Nenhum vínculo deste tipo está cadastrado para esta pessoa. Experimente outra titulação ou outro nome.',
      coverage: 'A genealogia reúne os vínculos cadastrados. Uma pessoa sem orientadores ou orientados visíveis pode ter registros ainda não incluídos.',
      none: 'Nenhuma pessoa encontrada.', matches: n => `${n} pessoas encontradas. Selecione um nome abaixo.`,
      truncated: 'Mostrando parte do ramo. Selecione uma pessoa para explorar suas conexões mais próximas.',
      cycles: 'Alguns vínculos não podem ser organizados em gerações. A lista textual preserva as relações cadastradas.',
      degrees: 'Titulações registradas', noDegree: 'Não há titulação cadastrada para esta pessoa nesta base.',
      supervised: n => `Orientações neste recorte (${n})`, records: n => `Lista dos vínculos exibidos (${n})`,
      year: 'Conclusão', institution: 'Instituição', sources: 'Fontes', facultyPage: 'Página pessoal',
      noSource: 'Registro do catálogo da comunidade', noPublicSource: 'Fonte registrada sem endereço público.',
      noYear: 'Ano não informado', hidden: 'Mais pessoas neste ramo', close: 'Fechar resultados',
      phdMetadata: 'Ano do doutorado informado no cadastro de docentes. Os vínculos de orientação desse grau podem não estar cadastrados.',
      sourceNumber: n => `Fonte ${n}`, reportedJoint: 'Orientação conjunta relatada (papel formal não confirmado)',
      levelName: { phd: 'Doutorado', masters: 'Mestrado', 'professional-masters': 'Mestrado profissional' }
    },
    en: {
      search: 'Find a person', placeholder: 'Name or part of a name', searchButton: 'Search', degree: 'Degrees',
      phd: 'PhD', masters: 'Master’s', professional: 'Professional master’s', all: 'Master’s and PhD',
      coadvisors: 'Show co-advising', ancestors: 'Expand advisors', descendants: 'Expand students', reset: 'Initial view',
      zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit the whole branch', graph: 'Academic genealogy',
      graphHelp: 'Drag the background to pan. Use the buttons to zoom in or out. When the graph has focus, arrow keys pan, + and − adjust the zoom, and Home fits the branch.',
      direct: 'Advising', co: 'Co-advising', joint: 'Joint advising', institutional: 'Institutional advising',
      member: 'Community faculty member', person: 'Selected person', focus: 'Explore this branch',
      summary: (name, n, e) => `${name} · ${n} people · ${e} displayed relationships`,
      selected: name => `Select ${name}`, focusName: name => `Explore ${name}’s branch`,
      absent: 'No relationship of this type is recorded for this person. Try another degree type or name.',
      coverage: 'The genealogy shows recorded relationships. A person with no visible advisors or students may have records that have not yet been included.',
      none: 'No person found.', matches: n => `${n} people found. Select a name below.`,
      truncated: 'Showing part of this branch. Select a person to explore their nearest connections.',
      cycles: 'Some relationships cannot be arranged into generations. The text list preserves the recorded relationships.',
      degrees: 'Recorded degrees', noDegree: 'No degree is recorded for this person in this dataset.',
      supervised: n => `Advising in this selection (${n})`, records: n => `List of displayed relationships (${n})`,
      year: 'Completion', institution: 'Institution', sources: 'Sources', facultyPage: 'Personal page',
      noSource: 'Community catalogue record', noPublicSource: 'Recorded source without a public address.',
      noYear: 'Year not recorded', hidden: 'More people in this branch', close: 'Close results',
      phdMetadata: 'PhD year recorded in the faculty directory. Advising relationships for this degree may not be included.',
      sourceNumber: n => `Source ${n}`, reportedJoint: 'Joint supervision reported (formal role unconfirmed)',
      levelName: { phd: 'PhD', masters: 'Master’s', 'professional-masters': 'Professional master’s' }
    }
  };

  function buildModel(data, level, includeCo) {
    const people = new Map((data.people || []).map(person => [person.id, person]));
    const degrees = (data.degrees || []).filter(degree => level === 'all' || (level === 'masters' ? ['masters', 'professional-masters'].includes(degree.level) : degree.level === level));
    const edges = [];
    degrees.forEach(degree => {
      if (!people.has(degree.personId)) return;
      (degree.advisors || []).forEach((advisor, i) => {
        if (!people.has(advisor.personId) || advisor.personId === degree.personId || (!includeCo && advisor.role === 'coadvisor')) return;
        edges.push({ id: `${degree.id}:${advisor.personId}:${i}`, source: advisor.personId, target: degree.personId, role: advisor.role || 'advisor', advisor, degree });
      });
    });
    const parents = new Map(), children = new Map();
    people.forEach((_, id) => { parents.set(id, new Set()); children.set(id, new Set()); });
    edges.forEach(edge => { parents.get(edge.target).add(edge.source); children.get(edge.source).add(edge.target); });
    return { people, degrees, edges, parents, children };
  }

  function neighbourhood(model, focus, up, down, limit = 70) {
    const ids = new Set([focus]);
    function visit(adjacency, depth) {
      let wave = new Set([focus]);
      const seen = new Set(wave);
      for (let n = 0; n < depth; n++) {
        const next = new Set();
        wave.forEach(id => (adjacency.get(id) || []).forEach(other => {
          ids.add(other);
          if (!seen.has(other)) { seen.add(other); next.add(other); }
        }));
        wave = next;
      }
    }
    visit(model.parents, up);
    visit(model.children, down);
    // Include the other advisors of displayed degrees, without inventing an
    // academic relationship between those advisors.
    const displayedChildren = new Set(ids);
    model.edges.forEach(edge => {
      if (displayedChildren.has(edge.target) && ids.has(edge.source)) {
        model.edges.filter(other => other.degree.id === edge.degree.id).forEach(other => ids.add(other.source));
      }
    });
    const allCount = ids.size;
    if (ids.size > limit) {
      const keep = Array.from(ids).slice(0, limit);
      ids.clear(); keep.forEach(id => ids.add(id));
    }
    return { ids, edges: model.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)), truncated: allCount > ids.size, allCount };
  }

  function layoutGraph(model, subset) {
    const nodes = Array.from(subset.ids).filter(id => model.people.has(id));
    const incoming = new Map(nodes.map(id => [id, new Set()]));
    const outgoing = new Map(nodes.map(id => [id, new Set()]));
    subset.edges.forEach(edge => { incoming.get(edge.target).add(edge.source); outgoing.get(edge.source).add(edge.target); });
    const indegree = new Map(nodes.map(id => [id, incoming.get(id).size]));
    const rank = new Map(nodes.map(id => [id, 0]));
    const queue = nodes.filter(id => indegree.get(id) === 0);
    let processed = 0;
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i]; processed++;
      outgoing.get(id).forEach(next => {
        rank.set(next, Math.max(rank.get(next), rank.get(id) + 1));
        indegree.set(next, indegree.get(next) - 1);
        if (indegree.get(next) === 0) queue.push(next);
      });
    }
    const cycle = processed !== nodes.length;
    if (cycle) nodes.filter(id => indegree.get(id) > 0).forEach(id => rank.set(id, Math.min(rank.get(id), nodes.length)));
    const layers = [];
    nodes.forEach(id => { (layers[rank.get(id)] ||= []).push(id); });
    layers.forEach(layer => layer.sort((a, b) => model.people.get(a).name.localeCompare(model.people.get(b).name, 'pt')));
    // Alternating barycentre passes reduce crossings while keeping every person
    // in exactly one position, including those with more than one advisor.
    for (let pass = 0; pass < 4; pass++) {
      const positions = new Map();
      layers.forEach(layer => layer.forEach((id, i) => positions.set(id, i)));
      const order = pass % 2 ? layers.slice().reverse() : layers;
      const neighbours = pass % 2 ? outgoing : incoming;
      order.forEach(layer => layer.sort((a, b) => {
        const average = id => {
          const values = Array.from(neighbours.get(id)).map(other => positions.get(other));
          return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : positions.get(id);
        };
        return average(a) - average(b);
      }));
    }
    const nodeWidth = 188, nodeHeight = 108, gapX = 28, gapY = 76, padding = 28;
    const columns = Math.max(1, ...layers.map(layer => layer.length));
    let width = columns * (nodeWidth + gapX) - gapX + 2 * padding;
    const height = layers.length * (nodeHeight + gapY) - gapY + 2 * padding;
    const positions = new Map();
    layers.forEach((layer, n) => {
      const rowWidth = layer.length * (nodeWidth + gapX) - gapX;
      layer.forEach((id, i) => positions.set(id, { x: (width - rowWidth) / 2 + i * (nodeWidth + gapX), y: padding + n * (nodeHeight + gapY), width: nodeWidth, height: nodeHeight }));
    });
    // A direct curve across several generations would run through intervening
    // cards. Give these links a corridor outside the rows, with turns confined
    // to the empty gaps immediately below and above their endpoints.
    const edgeRoutes = new Map(), lanes = { left: [], right: [] };
    const laneGap = 18, corridorMargin = 14;
    const skips = subset.edges.filter(edge => rank.get(edge.target) - rank.get(edge.source) > 1);
    skips.sort((a, b) => (rank.get(b.target) - rank.get(b.source)) - (rank.get(a.target) - rank.get(a.source)) || a.id.localeCompare(b.id));
    const availableLane = (side, start, end) => {
      const lane = lanes[side].findIndex(intervals => intervals.every(interval => end < interval[0] || start > interval[1]));
      return lane === -1 ? lanes[side].length : lane;
    };
    skips.forEach(edge => {
      const from = positions.get(edge.source), to = positions.get(edge.target);
      const start = rank.get(edge.source), end = rank.get(edge.target);
      const leftLane = availableLane('left', start, end), rightLane = availableLane('right', start, end);
      const centres = from.x + from.width / 2 + to.x + to.width / 2;
      const leftDistance = centres - 2 * padding + 2 * leftLane * laneGap;
      const rightDistance = 2 * (width - padding) - centres + 2 * rightLane * laneGap;
      const side = leftDistance <= rightDistance ? 'left' : 'right';
      const lane = side === 'left' ? leftLane : rightLane;
      (lanes[side][lane] ||= []).push([start, end]);
      edgeRoutes.set(edge.id, { side, lane });
    });
    const leftSpace = lanes.left.length ? corridorMargin + lanes.left.length * laneGap : 0;
    const rightSpace = lanes.right.length ? corridorMargin + lanes.right.length * laneGap : 0;
    const rowRight = width - padding;
    positions.forEach(position => { position.x += leftSpace; });
    edgeRoutes.forEach(route => {
      route.x = route.side === 'left'
        ? padding + leftSpace - corridorMargin - (route.lane + 1) * laneGap
        : rowRight + leftSpace + corridorMargin + (route.lane + 1) * laneGap;
    });
    width += leftSpace + rightSpace;
    return { positions, width, height, cycle, edgeRoutes, gapY };
  }

  function edgePath(geometry, edge, duplicate = 0) {
    const from = geometry.positions.get(edge.source), to = geometry.positions.get(edge.target);
    if (!from || !to) return '';
    const x1 = from.x + from.width / 2 + duplicate * 7, y1 = from.y + from.height;
    const x2 = to.x + to.width / 2 + duplicate * 7, y2 = to.y;
    const route = geometry.edgeRoutes.get(edge.id);
    if (!route) {
      const middle = (y1 + y2) / 2;
      return `M ${x1} ${y1} C ${x1} ${middle}, ${x2} ${middle}, ${x2} ${y2}`;
    }
    const turn = geometry.gapY / 2, x = route.x;
    return `M ${x1} ${y1} C ${x1} ${y1 + turn / 2}, ${x} ${y1 + turn / 2}, ${x} ${y1 + turn}` +
      ` L ${x} ${y2 - turn} C ${x} ${y2 - turn / 2}, ${x2} ${y2 - turn / 2}, ${x2} ${y2}`;
  }

  function mount(container, data, language) {
    if (!container) return null;
    if (container._genealogyDestroy) container._genealogyDestroy();
    container.replaceChildren();
    container.classList.add('history-genealogy');
    const lang = language === 'en' ? 'en' : 'pt', t = labels[lang];
    const people = new Map((data.people || []).map(person => [person.id, person]));
    if (!people.size) { container.textContent = t.absent; return null; }
    const initial = Array.from(people.values()).find(person => person.facultyId === 'yoshiharu-kohayakawa' || person.id === 'yoshiharu-kohayakawa') || people.values().next().value;
    let focus = initial.id, selected = focus, level = 'phd', includeCo = true, up = 1, down = 1;
    let model, subset, geometry, sceneX = 0, sceneY = 0, zoom = 1, drag = null, lastWidth = 0;
    const nodes = new Map();
    const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
    const svg = (tag, attributes) => { const node = document.createElementNS(NS, tag); Object.entries(attributes || {}).forEach(([key, value]) => node.setAttribute(key, value)); return node; };
    const button = (text, action, className) => { const node = el('button', text, className); node.type = 'button'; if (action) node.addEventListener('click', action); return node; };
    const sourceLink = (label, href) => {
      try { const url = new URL(href, location.href); if (!/^https?:$/.test(url.protocol)) return el('span', label); const a = el('a', label); a.href = url.href; return a; }
      catch (_) { return el('span', label); }
    };
    const roleLabel = value => {
      const role = typeof value === 'string' ? value : value.role;
      if (typeof value === 'object' && value.formalRoleConfirmed === false && role === 'joint') return t.reportedJoint;
      return role === 'coadvisor' ? t.co : role === 'joint' ? t.joint : role === 'institutional' ? t.institutional : t.direct;
    };
    const degreeLabel = degree => `${t.levelName[degree.level] || degree.level} · ${degree.year || t.noYear} · ${degree.institution || ''}`;
    const controls = el('div', undefined, 'hg-controls');
    const searchForm = el('form', undefined, 'hg-search'); searchForm.setAttribute('role', 'search');
    const searchLabel = el('label', t.search); const searchInput = el('input'); searchInput.type = 'search'; searchInput.placeholder = t.placeholder; searchInput.autocomplete = 'off';
    searchLabel.append(searchInput); searchForm.append(searchLabel);
    const searchButton = el('button', t.searchButton); searchButton.type = 'submit'; searchForm.append(searchButton);
    const degreeControl = el('label', t.degree); const degreeSelect = el('select');
    [['phd', t.phd], ['masters', t.masters], ['all', t.all]].forEach(([value, name]) => { const option = el('option', name); option.value = value; degreeSelect.append(option); });
    degreeControl.append(degreeSelect);
    const coLabel = el('label', undefined, 'hg-check'); const coCheckbox = el('input'); coCheckbox.type = 'checkbox'; coCheckbox.checked = true; coLabel.append(coCheckbox, el('span', t.coadvisors));
    controls.append(searchForm, degreeControl, coLabel);
    const searchResults = el('div', undefined, 'hg-search-results'); searchResults.hidden = true;
    const searchStatus = el('p', undefined, 'hg-search-status'); searchStatus.setAttribute('role', 'status');
    const branchControls = el('div', undefined, 'hg-branch-controls');
    const ancestorButton = button(t.ancestors, () => { up++; render(); });
    const descendantButton = button(t.descendants, () => { down++; render(); });
    const resetButton = button(t.reset, reset);
    branchControls.append(ancestorButton, descendantButton, resetButton);
    const summary = el('p', undefined, 'hg-summary'); summary.setAttribute('role', 'status');
    const legend = el('div', undefined, 'hg-legend');
    [['member', t.member], ['advisor', t.direct], ['coadvisor', t.co], ['joint', t.joint]].forEach(([key, text]) => { const item = el('span'); item.append(el('i', undefined, `hg-key hg-key--${key}`), document.createTextNode(text)); legend.append(item); });
    const viewport = el('div', undefined, 'hg-viewport'); viewport.tabIndex = 0; viewport.setAttribute('role', 'region'); viewport.setAttribute('aria-label', t.graph);
    const helpId = `hg-help-${Math.random().toString(36).slice(2)}`;
    viewport.setAttribute('aria-describedby', helpId);
    const scene = el('div', undefined, 'hg-scene'); viewport.append(scene);
    const toolbar = el('div', undefined, 'hg-zoom-controls');
    toolbar.append(button('−', () => zoomBy(1 / 1.2), 'hg-zoom-out'), button('+', () => zoomBy(1.2), 'hg-zoom-in'), button(t.fit, () => frame(true)));
    toolbar.children[0].setAttribute('aria-label', t.zoomOut); toolbar.children[1].setAttribute('aria-label', t.zoomIn);
    const help = el('p', t.graphHelp, 'hg-help'); help.id = helpId;
    const warning = el('p', undefined, 'hg-notice'); warning.hidden = true;
    const detail = el('section', undefined, 'hg-detail'); detail.setAttribute('aria-label', t.person);
    const connectionList = el('details', undefined, 'hg-connections');
    const coverage = el('p', t.coverage, 'hg-coverage');
    container.append(controls, searchStatus, searchResults, branchControls, summary, legend, toolbar, viewport, help, warning, detail, connectionList, coverage);

    function search(submitted) {
      const query = normalise(searchInput.value.trim());
      searchResults.replaceChildren();
      if (!query) { searchResults.hidden = true; searchStatus.textContent = ''; return; }
      const candidates = Array.from(people.values()).filter(person => [person.name, ...(person.aliases || [])].some(name => normalise(name).includes(query))).sort((a, b) => a.name.localeCompare(b.name, lang));
      const exact = candidates.find(person => normalise(person.name) === query);
      if (submitted && (exact || candidates.length === 1)) { setFocus((exact || candidates[0]).id); searchStatus.textContent = ''; return; }
      searchStatus.textContent = candidates.length ? t.matches(candidates.length) : t.none;
      searchResults.hidden = !candidates.length;
      candidates.slice(0, 30).forEach(person => searchResults.append(button(person.name, () => { setFocus(person.id); searchStatus.textContent = ''; })));
      if (candidates.length) searchResults.append(button(t.close, () => { searchResults.hidden = true; searchStatus.textContent = ''; }));
    }
    searchForm.addEventListener('submit', event => { event.preventDefault(); search(true); });
    searchInput.addEventListener('input', () => search(false));
    degreeSelect.addEventListener('change', () => { level = degreeSelect.value; up = 1; down = 1; render(); });
    coCheckbox.addEventListener('change', () => { includeCo = coCheckbox.checked; render(); });

    function setFocus(id) {
      focus = id; selected = id; up = 1; down = 1;
      searchInput.value = people.get(id).name;
      searchResults.hidden = true;
      render();
    }
    function reset() {
      focus = initial.id; selected = focus; level = 'phd'; up = 1; down = 1; includeCo = true;
      degreeSelect.value = level; coCheckbox.checked = true; searchInput.value = ''; searchStatus.textContent = ''; searchResults.hidden = true;
      render();
    }
    function transform() { scene.style.transform = `translate(${sceneX}px, ${sceneY}px) scale(${zoom})`; }
    function zoomBy(multiplier, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) {
      const next = Math.max(.02, Math.min(2.5, zoom * multiplier));
      sceneX = x - (x - sceneX) * next / zoom; sceneY = y - (y - sceneY) * next / zoom; zoom = next; transform();
    }
    function frame(all) {
      if (!geometry || !viewport.clientWidth) return;
      const fit = Math.min((viewport.clientWidth - 24) / geometry.width, (viewport.clientHeight - 24) / geometry.height, 1.1);
      zoom = all ? Math.max(.02, fit) : Math.max(.85, Math.min(1, fit));
      const focal = geometry.positions.get(focus);
      sceneX = all ? (viewport.clientWidth - geometry.width * zoom) / 2 : viewport.clientWidth / 2 - (focal.x + focal.width / 2) * zoom;
      sceneY = geometry.height * zoom <= viewport.clientHeight ? (viewport.clientHeight - geometry.height * zoom) / 2 : 20 - Math.max(0, focal.y - 170) * zoom;
      transform();
    }
    viewport.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button')) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, sx: sceneX, sy: sceneY };
      viewport.setPointerCapture(event.pointerId); viewport.classList.add('is-dragging');
    });
    viewport.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      sceneX = drag.sx + event.clientX - drag.x; sceneY = drag.sy + event.clientY - drag.y; transform();
    });
    const stopDrag = () => { drag = null; viewport.classList.remove('is-dragging'); };
    viewport.addEventListener('pointerup', stopDrag); viewport.addEventListener('pointercancel', stopDrag);
    viewport.addEventListener('wheel', event => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault(); const rect = viewport.getBoundingClientRect(); zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false });
    viewport.addEventListener('keydown', event => {
      if (event.target !== viewport) return;
      const offsets = { ArrowLeft: [45, 0], ArrowRight: [-45, 0], ArrowUp: [0, 45], ArrowDown: [0, -45] };
      if (offsets[event.key]) { event.preventDefault(); sceneX += offsets[event.key][0]; sceneY += offsets[event.key][1]; transform(); }
      else if (['+', '=', '-', 'Home'].includes(event.key)) { event.preventDefault(); event.key === 'Home' ? frame(true) : zoomBy(event.key === '-' ? 1 / 1.2 : 1.2); }
    });

    function showPerson(id) {
      selected = id;
      nodes.forEach((node, key) => { node.classList.toggle('is-selected', key === id); node.setAttribute('aria-pressed', key === id ? 'true' : 'false'); });
      detail.replaceChildren();
      const person = people.get(id);
      const title = el('div', undefined, 'hg-detail-heading'); title.append(el('h3', person.name));
      if (id !== focus) title.append(button(t.focus, () => setFocus(id)));
      detail.append(title);
      if (person.url) detail.append(sourceLink(t.facultyPage, person.url));
      const degrees = (data.degrees || []).filter(degree => degree.personId === id).sort((a, b) => (b.year || 0) - (a.year || 0));
      const records = el('div', undefined, 'hg-degree-records');
      if (person.phdYear && !degrees.some(degree => degree.level === 'phd')) {
        const item = el('div', undefined, 'hg-degree-record');
        item.append(el('strong', `${t.phd} · ${person.phdYear}`), el('p', t.phdMetadata, 'hg-note'));
        if ((person.phdSources || []).length) {
          const disclosure = el('details', undefined, 'hg-sources'); disclosure.append(el('summary', t.sources)); const list = el('ul');
          person.phdSources.forEach((url, i) => { const li = el('li'); li.append(sourceLink(t.sourceNumber(i + 1), url)); list.append(li); });
          disclosure.append(list); item.append(disclosure);
        }
        records.append(item);
      }
      if (degrees.length) {
        records.append(el('h4', t.degrees));
        degrees.forEach(degree => {
          const item = el('div', undefined, 'hg-degree-record'); item.append(el('strong', degreeLabel(degree)));
          const advisors = el('ul');
          (degree.advisors || []).forEach(advisor => {
            const other = people.get(advisor.personId); if (!other) return;
            const line = el('li'); line.append(document.createTextNode(`${roleLabel(advisor)}: `), button(other.name, () => setFocus(other.id), 'hg-text-button')); advisors.append(line);
          });
          item.append(advisors);
          const note = textAt(degree.notes, lang); if (note) item.append(el('p', note, 'hg-note'));
          const sources = degree.sources || [];
          if (sources.length) {
            const disclosure = el('details', undefined, 'hg-sources'); disclosure.append(el('summary', t.sources)); const list = el('ul');
            sources.forEach(source => { const li = el('li'); const label = textAt(source.label, lang) || t.noSource; li.append(source.url ? sourceLink(label, source.url) : el('span', label)); list.append(li); });
            disclosure.append(list); item.append(disclosure);
          }
          records.append(item);
        });
      } else if (!person.phdYear) records.append(el('p', t.noDegree, 'hg-note'));
      detail.append(records);
      const outgoing = model.edges.filter(edge => edge.source === id);
      if (outgoing.length) {
        const disclosure = el('details', undefined, 'hg-person-students'); disclosure.append(el('summary', t.supervised(outgoing.length))); const list = el('ul');
        outgoing.forEach(edge => { const li = el('li'); li.append(button(people.get(edge.target).name, () => setFocus(edge.target), 'hg-text-button'), document.createTextNode(` — ${degreeLabel(edge.degree)} (${roleLabel(edge.advisor)})`)); list.append(li); });
        disclosure.append(list); detail.append(disclosure);
      }
    }

    function render() {
      model = buildModel(data, level, includeCo); subset = neighbourhood(model, focus, up, down); geometry = layoutGraph(model, subset);
      scene.replaceChildren(); nodes.clear(); scene.style.width = `${geometry.width}px`; scene.style.height = `${geometry.height}px`;
      const chart = svg('svg', { class: 'hg-links', width: geometry.width, height: geometry.height, viewBox: `0 0 ${geometry.width} ${geometry.height}`, 'aria-hidden': 'true' });
      const markerId = `${helpId}-arrow`; const defs = svg('defs'); const marker = svg('marker', { id: markerId, markerWidth: 7, markerHeight: 7, refX: 6, refY: 3.5, orient: 'auto' }); marker.append(svg('path', { d: 'M0 0L7 3.5L0 7Z', class: 'hg-arrow' })); defs.append(marker); chart.append(defs);
      const pairOffsets = new Map();
      subset.edges.forEach(edge => {
        const from = geometry.positions.get(edge.source), to = geometry.positions.get(edge.target); if (!from || !to) return;
        const key = `${edge.source}|${edge.target}`, duplicate = pairOffsets.get(key) || 0; pairOffsets.set(key, duplicate + 1);
        const line = svg('path', { d: edgePath(geometry, edge, duplicate), class: `hg-edge hg-edge--${edge.role}`, 'marker-end': `url(#${markerId})` });
        chart.append(line);
      });
      scene.append(chart);
      geometry.positions.forEach((position, id) => {
        const person = people.get(id);
        const node = button(undefined, () => showPerson(id), `hg-node${person.facultyId ? ' hg-node--faculty' : ''}${id === focus ? ' hg-node--focus' : ''}`);
        node.style.left = `${position.x}px`; node.style.top = `${position.y}px`; node.style.width = `${position.width}px`; node.style.height = `${position.height}px`;
        node.setAttribute('aria-label', t.selected(person.name)); node.setAttribute('aria-pressed', id === selected ? 'true' : 'false'); node.dataset.personId = id;
        node.append(el('span', person.name, 'hg-node-name'));
        const ownDegrees = model.degrees.filter(degree => degree.personId === id).sort((a, b) => (b.level === 'phd') - (a.level === 'phd') || (b.year || 0) - (a.year || 0));
        if (person.phdYear && (!ownDegrees.length || ownDegrees[0].level !== 'phd')) node.append(el('span', `${t.phd} · ${person.phdYear}`, 'hg-node-meta'));
        else if (ownDegrees.length) node.append(el('span', `${t.levelName[ownDegrees[0].level]} · ${ownDegrees[0].year || t.noYear}`, 'hg-node-meta'));
        else if (person.facultyId) node.append(el('span', t.member, 'hg-node-meta'));
        scene.append(node); nodes.set(id, node);
      });
      summary.textContent = t.summary(people.get(focus).name, subset.ids.size, subset.edges.length);
      ancestorButton.disabled = neighbourhood(model, focus, up + 1, down).allCount <= subset.allCount || up >= 10;
      descendantButton.disabled = neighbourhood(model, focus, up, down + 1).allCount <= subset.allCount || down >= 10;
      warning.hidden = !subset.truncated && !geometry.cycle && subset.edges.length > 0;
      warning.textContent = geometry.cycle ? t.cycles : subset.truncated ? t.truncated : subset.edges.length ? '' : t.absent;
      connectionList.replaceChildren(el('summary', t.records(subset.edges.length)));
      const list = el('ul');
      subset.edges.slice().sort((a, b) => (a.degree.year || 0) - (b.degree.year || 0) || people.get(a.target).name.localeCompare(people.get(b.target).name, lang)).forEach(edge => {
        const li = el('li'); li.append(button(people.get(edge.source).name, () => setFocus(edge.source), 'hg-text-button'), document.createTextNode(' → '), button(people.get(edge.target).name, () => setFocus(edge.target), 'hg-text-button'), document.createTextNode(` — ${degreeLabel(edge.degree)} (${roleLabel(edge.advisor)})`)); list.append(li);
      });
      connectionList.append(list);
      if (!subset.ids.has(selected)) selected = focus;
      showPerson(selected); frame(false);
    }
    const observer = new ResizeObserver(() => {
      if (Math.abs(viewport.clientWidth - lastWidth) > 1) { lastWidth = viewport.clientWidth; frame(false); }
    });
    observer.observe(viewport);
    container._genealogyDestroy = () => observer.disconnect();
    render();
    return { reset, destroy: container._genealogyDestroy };
  }

  const api = { mount, model: { buildModel, neighbourhood, layoutGraph, edgePath } };
  global.CommunityGenealogy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
