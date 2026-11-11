(() => {
  "use strict";
  const root = document.querySelector(".co-directory");
  if (!root) return;
  const data = JSON.parse(root.querySelector(".co-data").textContent);
  const en = root.dataset.lang === "en";
  const lang = en ? "en" : "pt-BR";
  const t = (pt, eng) => en ? eng : pt;
  const collator = new Intl.Collator(lang, { sensitivity: "base" });
  const regionNames = new Intl.DisplayNames([lang], {type: "region"});
  const faculty = new Map(data.faculty.map(person => [person.id, person]));
  const papers = new Map(data.papers.map(paper => [paper.id, paper]));
  const byName = name => (data.aliases || {})[name] || name;
  const idFor = author => author.facultyId || "author:" + byName(author.name);
  const fold = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replaceAll("ł", "l").replaceAll("ø", "o");
  const people = new Map(data.network.people.map(p => [p.id, p]));
  const linksByFaculty = new Map(data.faculty.map(f => [f.id, new Map()]));
  const externalProfiles = [];
  for (const person of people.values()) {
    const links = new Map(Object.entries(person.links));
    for (const [facultyId, ids] of links) linksByFaculty.get(facultyId).set(person.id, ids);
    if (!faculty.has(person.id)) externalProfiles.push({person, links, joint: person.papers});
  }
  const facultyProfiles = data.faculty.map(member => {
    const person = people.get(member.id) || member;
    const links = linksByFaculty.get(member.id);
    return {person, links, joint: [...new Set([...links.values()].flat())]};
  });
  const nameOf = id => people.get(id)?.name || faculty.get(id)?.name || id.replace(/^author:/, "");
  const searchKeys = new Map([...facultyProfiles, ...externalProfiles].map(({person}) =>
    [person.id, [person.name, ...(person.variants || []), ...(person.aliases || [])].map(fold)]));
  const fmt = n => n.toLocaleString(lang);
  const pageSize = 20;
  const find = selector => root.querySelector(selector);
  const memberFilter = find('[data-filter="faculty"]');
  const requestedMember = new URLSearchParams(location.search).get("docente");
  if (faculty.has(requestedMember)) memberFilter.value = requestedMember;
  const nameFilter = find('[data-filter="name"]');
  const sortFilter = find('[data-filter="sort"]');
  const globePanel = find("#globo");
  const tbody = find("tbody");
  const paperOrder = (a, b) => b.year - a.year || collator.compare(a.title, b.title);
  const modesByHash = {"#docentes": "faculty", "#externos": "external", "#pesquisadores": "external", "#globo": "globe"};
  let mode = modesByHash[location.hash] || "globe";
  const sortByMode = {faculty: "name", external: "papers"};
  sortFilter.value = sortByMode[mode] || sortByMode.faculty;
  let page = 0, selected = null, mountedDiagram = null, globeDirty = true;
  let currentPeople = [], eligible = [];
  function el(tag, value, className) {
    const node = document.createElement(tag);
    if (value != null) node.textContent = value;
    if (className) node.className = className;
    return node;
  }
  function button(label, action, className) {
    const node = el("button", label, className);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  }
  function affiliationLine(person, paper) {
    const author = paper.authors.find(a => idFor(a) === person.id);
    const record = data.geo?.papers?.[paper.id];
    const codes = record?.authors?.[author?.name];
    if (!codes?.length) return null;
    const institutions = record.institutions?.[author.name] || [];
    const labels = codes.map(code => {
      const names = [...new Set(institutions.filter(inst => inst.country === code).map(inst => inst.name).filter(Boolean))];
      const country = regionNames.of(code);
      return names.length ? names.join(", ") + " (" + country + ")" : country;
    });
    const prefix = record.authorEvidence?.[author.name]
      ? t("Afiliação de outra fonte: ", "Affiliation from another source: ")
      : t("Afiliação no artigo: ", "Affiliation on this paper: ");
    const line = el("small", prefix + labels.join(" · "));
    const source = record.authorSources?.[author.name] || record.source;
    if (source && /^https?:\/\//i.test(source)) {
      const link = el("a", t("Fonte", "Source"));
      link.href = source;
      line.append(" · ", link);
    }
    return line;
  }
  function setScope() {
    const id = memberFilter.value;
    const isExternal = mode === "external";
    currentPeople = isExternal
      ? externalProfiles.filter(entry => !id || entry.links.has(id))
      : facultyProfiles.filter(entry => !id || entry.person.id === id);
    const paperIds = new Set(), partnerIds = new Set(), pairs = new Set();
    for (const {person, links} of currentPeople) {
      for (const [partner, ids] of links) {
        if (isExternal && id && partner !== id) continue;
        partnerIds.add(isExternal ? person.id : partner);
        pairs.add(JSON.stringify([person.id, partner].sort()));
        ids.forEach(key => paperIds.add(key));
      }
    }
    eligible = [...paperIds].map(key => papers.get(key));
    for (const [key, value] of Object.entries({people:partnerIds.size, papers:paperIds.size, pairs:pairs.size})) {
      find('[data-count="' + key + '"]').textContent = fmt(value);
    }
    find("[data-name-header]").textContent = isExternal ? t("Pesquisador externo", "External researcher") : t("Docente", "Faculty member");
    find("[data-partners-header]").textContent = isExternal ? t("Docentes parceiros", "Faculty partners") : t("Coautores", "Coauthors");
    find("[data-search-label]").textContent = isExternal ? t("Buscar pesquisador externo", "Find an external researcher") : t("Buscar docente", "Find a faculty member");
    find('option[value="partners"]').textContent = isExternal ? t("Mais docentes parceiros", "Most faculty partners") : t("Mais coautores", "Most coauthors");
    find("[data-filter-note]").hidden = !isExternal || !id;
    page = 0;
    selected = !isExternal && id ? id : null;
    globeDirty = true;
    renderDirectory();
    if (mode === "globe") drawGlobe();
  }
  function countryView() {
    const countries = new Map();
    const gaps = [];
    let partial = 0, unmapped = 0;
    for (const paper of eligible) {
      const members = new Set(paper.authors.map(a => a.facultyId).filter(id => faculty.has(id)));
      const authors = paper.authors.filter(a => mode === "external" ? !members.has(a.facultyId) : memberFilter.value ? a.facultyId !== memberFilter.value :
        !members.has(a.facultyId) || members.size > 1);
      const record = data.geo?.papers?.[paper.id];
      const byCountry = new Map();
      const covered = new Set();
      for (const author of authors) {
        const key = idFor(author);
        const name = faculty.get(author.facultyId)?.name || byName(author.name);
        for (const code of record?.authors?.[author.name] || []) {
          covered.add(key);
          if (!byCountry.has(code)) byCountry.set(code, new Map());
          const institutes = (record.institutions?.[author.name] || []).filter(inst => inst.country === code).map(inst => inst.name).filter(Boolean);
          byCountry.get(code).set(key, { name, institutions: [...new Set(institutes)], source: record.authorSources?.[author.name] || record.source });
        }
      }
      const missing = authors.filter(a => !covered.has(idFor(a)));
      if (!covered.size) unmapped++;
      else if (missing.length) partial++;
      if (missing.length) gaps.push({title: paper.title, year: paper.year, url: paper.url, authors: missing.map(a => a.name)});
      for (const [code, collaborators] of byCountry) {
        if (!countries.has(code)) countries.set(code, { code, papers: [] });
        const affiliations = [...collaborators.values()];
        countries.get(code).papers.push({id: paper.id, title: paper.title, year: paper.year, url: paper.url,
          contributors: affiliations.map(a => a.name), affiliations, source: record.source});
      }
    }
    for (const country of countries.values()) country.papers.sort(paperOrder);
    return {lang: en ? "en" : "pt", countries: [...countries.values()], maxCountryCount: Math.max(1, ...Object.values(data.geo.countries).map(group => group.count)), partial, unmapped, total: eligible.length, gaps: gaps.sort(paperOrder)};
  }

  function drawGlobe() {
    if (!globeDirty) return;
    window.renderCollaborationGlobe(find(".co-globe"), countryView());
    globeDirty = false;
  }
  function syncTabs() {
    for (const tab of root.querySelectorAll("[data-tab]")) {
      const active = tab.dataset.tab === mode;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    find("#co-perfis").setAttribute("aria-labelledby", mode === "external" ? "externos" : "docentes");
    find("#co-perfis").hidden = mode === "globe";
    globePanel.hidden = mode !== "globe";
  }

  function switchMode(next) {
    if (next === mode) return;
    mode = next;
    if (mode !== "globe") sortFilter.value = sortByMode[mode];
    nameFilter.value = "";
    syncTabs();
    setScope();
  }

  function details(entry) {
    const {person, links, joint} = entry;
    const container = el("div", null, "co-detail");
    container.id = "co-connection-detail";
    container.append(el("h3", t("Conexões de ", "Connections of ") + person.name));
    if (!links.size) {
      container.append(el("p", t("Nenhuma coautoria no catálogo.", "No coauthored papers in the catalogue.")));
      return container;
    }
    const allLinks = new Map();
    if (mode === "external") {
      for (const paperId of joint) {
        const ids = new Set(papers.get(paperId).authors.map(idFor));
        ids.delete(person.id);
        for (const id of ids) {
          if (!allLinks.has(id)) allLinks.set(id, []);
          allLinks.get(id).push(paperId);
        }
      }
    }
    const help = el("p", t("Selecione um coautor para ver os artigos da parceria.", "Select a coauthor to see the joint papers."), "co-muted");
    const diagramHost = el("div");
    const bibliography = el("div", null, "co-bibliography");
    const reset = button(t("Todos os artigos", "All papers"), () => selectPartner(null), "co-all-articles");
    const scopeButtons = new Map();
    let visibleLinks = links, partner = null;
    function selectPartner(id) {
      partner = id;
      mountedDiagram.setSelected(id);
      reset.hidden = !id;
      const items = (id ? visibleLinks.get(id) : joint).map(key => papers.get(key)).sort(paperOrder);
      bibliography.replaceChildren();
      const title = id ? t("Artigos com ", "Papers with ") + nameOf(id) : t("Artigos conjuntos", "Joint papers");
      bibliography.append(el("h4",title + " (" + items.length + ")"));
      const list = el("ul");
      for (const paper of items) {
        const item = el("li"), link = el("a",paper.title);
        link.href = paper.url;
        item.append(el("span",paper.year, "co-year"), link, el("small", paper.authors.map(a => a.name).join(", ")));
        const affiliation = affiliationLine(person, paper);
        if (affiliation) item.append(affiliation);
        list.append(item);
      }
      bibliography.append(list);
    }
    function showPartners(scope) {
      mountedDiagram?.destroy();
      visibleLinks = scope === "all" ? allLinks : links;
      const partners = [...visibleLinks].map(([id, ids]) => ({id, name:nameOf(id), count:ids.length}))
        .sort((a,b) => b.count-a.count || collator.compare(a.name,b.name));
      mountedDiagram = window.createCoauthorDiagram({name:person.name, partners, lang:en ? "en" : "pt",
        onSelect: id => selectPartner(partner === id ? null : id)});
      diagramHost.replaceChildren(mountedDiagram.element);
      for (const [key,node] of scopeButtons) node.setAttribute("aria-pressed", String(key === scope));
      selectPartner(null);
    }
    if (mode === "external" && allLinks.size > links.size) {
      const controls = el("div", null, "co-partner-scopes");
      const scopes = [
        ["faculty", t("Docentes do grupo", "Group faculty") + " (" + links.size + ")"],
        ["all", t("Todos os coautores nesses artigos", "All coauthors on these papers") + " (" + allLinks.size + ")"]
      ];
      for (const [key, label] of scopes) {
        const node = button(label, () => showPartners(key));
        node.dataset.partnerScope = key;
        controls.append(node);
        scopeButtons.set(key, node);
      }
      container.append(controls);
    }
    container.append(help, diagramHost, reset, bibliography);
    showPartners("faculty");
    return container;
  }
  function downloadBibliography(person) {
    const publications = [...papers.values()].filter(paper => paper.authors.some(author => author.facultyId === person.id)).sort(paperOrder);
    const header = "% " + t("Quando disponíveis, as entradas foram obtidas do MathSciNet.", "When available, entries were obtained from MathSciNet.") + "\n\n";
    const text = header + publications.map(paper => data.bibtex[paper.id].trim()).join("\n\n") + "\n";
    const url = URL.createObjectURL(new Blob([text], {type:"application/x-bibtex;charset=utf-8"}));
    const link = el("a");
    link.href = url;
    link.download = "publicacoes-" + person.id + ".bib";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function renderDirectory() {
    const query = fold(nameFilter.value.trim());
    const matched = currentPeople.filter(({person}) => searchKeys.get(person.id).some(name => name.includes(query)));
    const alpha = (a,b) => collator.compare(a.person.name,b.person.name);
    const sort = sortFilter.value;
    matched.sort((a,b) => (sort === "name" ? 0 : sort === "partners" ? b.links.size-a.links.size || b.joint.length-a.joint.length : b.joint.length-a.joint.length) || alpha(a,b));
    const pages = Math.max(1,Math.ceil(matched.length/pageSize));
    page = Math.max(0, Math.min(page,pages-1));
    const first = page*pageSize, subset = matched.slice(first, first+pageSize);
    find(".co-result").textContent = matched.length ? (first + 1) + "–" + (first + subset.length) + t(" de ", " of ") + fmt(matched.length) + (mode === "faculty" ? t(" docentes", " faculty members") : t(" pesquisadores externos", " external researchers")) : t("Nenhum pesquisador encontrado.", "No matching researchers.");
    mountedDiagram?.destroy(); mountedDiagram = null;
    tbody.replaceChildren();
    for (const entry of subset) {
      const {person} = entry;
      const isOpen = person.id === selected, row = el("tr");
      const name = el("th");
      name.scope = "row";
      const trigger = button(person.name, () => {
        selected = isOpen ? null : person.id;
        renderDirectory();
        [...tbody.querySelectorAll(".co-person")].find(n => n.dataset.id === person.id)?.focus({preventScroll:true});
      }, "co-person");
      trigger.dataset.id = person.id;
      trigger.setAttribute("aria-expanded",String(isOpen));
      if (isOpen) trigger.setAttribute("aria-controls","co-connection-detail");
      const identity = el("div", null, "co-faculty-name");
      identity.append(trigger);
      if (mode === "faculty") {
        const download = button("BibTeX", () => downloadBibliography(person), "co-bibtex");
        download.setAttribute("aria-label", t("Baixar BibTeX de ", "Download BibTeX for ") + person.name);
        download.title = t("Todas as publicações deste docente no catálogo", "All of this faculty member's publications in the catalogue");
        identity.append(download);
      }
      name.append(identity);

      row.append(name, el("td",fmt(entry.links.size)), el("td",fmt(entry.joint.length)));
      tbody.append(row);
      if (isOpen) {
        row.className = "co-selected";
        const detailRow = el("tr"); const cell = el("td"); cell.colSpan=3;
        cell.className="co-detail-cell"; cell.append(details(entry)); detailRow.append(cell); tbody.append(detailRow);
      }
    }
    const pager = find(".co-pager");
    pager.replaceChildren();
    if (pages > 1) {
      const changePage = delta => {
        page += delta; selected=null; renderDirectory();
        const firstButton = tbody.querySelector(".co-person");
        firstButton?.focus({preventScroll:true});
        find(".co-list-tools").scrollIntoView({block:"start"});
      };
      const previous = button(t("Anterior", "Previous"), () => changePage(-1));
      const next = button(t("Próxima", "Next"), () => changePage(1));
      previous.disabled = page === 0; next.disabled = page === pages-1;
      pager.append(previous, el("span",(page+1)+" / "+pages), next);
    }
  }

  function refreshSearch() { page=0; selected=null; renderDirectory(); }
  memberFilter.addEventListener("change", () => {
    const url = new URL(location.href);
    if (memberFilter.value) url.searchParams.set("docente", memberFilter.value);
    else url.searchParams.delete("docente");
    history.replaceState(null, "", url);
    nameFilter.value = "";
    setScope();
  });
  nameFilter.addEventListener("input",refreshSearch);
  sortFilter.addEventListener("change", () => {
    sortByMode[mode] = sortFilter.value;
    refreshSearch();
  });
  const tabs = [...root.querySelectorAll("[data-tab]")];
  for (const [i, tab] of tabs.entries()) {
    tab.addEventListener("click", event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const position = {left: window.scrollX, top: window.scrollY, behavior: "instant"};
      if (location.hash !== tab.hash) history.pushState(null, "", tab.hash);
      switchMode(tab.dataset.tab);
      window.scrollTo(position);
    });
    tab.addEventListener("keydown", event => {
      const index = {ArrowLeft:(i+tabs.length-1)%tabs.length, ArrowRight:(i+1)%tabs.length, Home:0, End:tabs.length-1}[event.key];
      if (index === undefined) return;
      event.preventDefault();
      tabs[index].focus({preventScroll: true});
      tabs[index].click();
    });
  }
  function restore() {
    const member = new URLSearchParams(location.search).get("docente");
    const id = faculty.has(member) ? member : "";
    if (memberFilter.value !== id) {
      memberFilter.value = id;
      setScope();
    }
    switchMode(modesByHash[location.hash] || "globe");
  }
  window.addEventListener("hashchange",restore);
  window.addEventListener("popstate",restore);
  syncTabs();
  setScope();
})();
