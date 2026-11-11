(() => {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const pageSize = 8;

  function node(tag, className, value) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (value != null) result.textContent = value;
    return result;
  }
  function searchKey(name) {
    return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replaceAll("ł", "l").replaceAll("ø", "o");
  }

  window.createCoauthorDiagram = function ({name, partners, lang, onSelect}) {
    const en = String(lang).startsWith("en");
    const element = node("div", "co-diagram");
    const network = node("div", "co-network");
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    const source = node("div", "co-network-source", name);
    const targets = node("div", "co-network-targets");
    network.append(svg, source, targets);

    const search = node("input", "co-partner-search");
    search.type = "search";
    search.placeholder = en ? "Find a coauthor by name" : "Buscar coautor pelo nome";
    search.setAttribute("aria-label", search.placeholder);
    if (partners.length > pageSize) element.append(search);
    element.append(network);

    const pager = node("div", "co-network-pager");
    const status = node("span", "co-network-count");
    status.setAttribute("role", "status");
    const previous = node("button", "", en ? "Previous" : "Anterior");
    const next = node("button", "", en ? "Next" : "Próxima");
    previous.type = next.type = "button";
    previous.dataset.step = "previous";
    next.dataset.step = "next";
    pager.append(status, previous, next);
    element.append(pager);
    const weights = partners.map(partner => partner.count);
    const maxCount = Math.max(1, ...weights);

    let selected = null, page = 0;
    let visible = [];
    // The absolutely positioned SVG uses CSS pixels. Update it during the same
    // resize notification as the labels, before the browser paints the new layout.
    const observer = new ResizeObserver(draw);

    function draw() {
      const bounds = svg.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const start = source.getBoundingClientRect();
      const x1 = start.right - bounds.left;
      const y1 = start.top + start.height / 2 - bounds.top;
      const positions = visible.map(({target}) => target.getBoundingClientRect());
      visible.forEach(({path}, i) => {
        const end = positions[i];
        const x2 = end.left - bounds.left;
        const y2 = end.top + end.height / 2 - bounds.top;
        const mid = (x1 + x2) / 2;
        path.setAttribute("d", `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`);
      });
    }
    function setSelected(id) {
      selected = id;
      for (const {target, path} of visible) {
        const active = target.dataset.partnerId === id;
        target.setAttribute("aria-pressed", String(active));
        path.classList.toggle("co-active", active);
      }
    }
    function render() {
      const query = searchKey(search.value.trim());
      const matches = query ? partners.filter(p => searchKey(p.name).includes(query)) : partners;
      const first = page * pageSize;
      const subset = matches.slice(first, first + pageSize);
      observer.disconnect();
      targets.replaceChildren();
      svg.replaceChildren();
      visible = subset.map(partner => {
        const path = document.createElementNS(NS, "path");
        path.dataset.partnerId = partner.id;
        path.setAttribute("stroke-width", String(1 + 3 * Math.sqrt(partner.count / maxCount)));
        path.setAttribute("vector-effect", "non-scaling-stroke");
        svg.append(path);
        const target = node("button", "co-target");
        target.type = "button";
        target.dataset.partnerId = partner.id;
        const unit = en ? (partner.count === 1 ? "joint paper" : "joint papers") : (partner.count === 1 ? "artigo conjunto" : "artigos conjuntos");
        target.setAttribute("aria-label", partner.name + " · " + partner.count + " " + unit);
        target.append(node("span", "", partner.name), node("strong", "", partner.count));
        target.addEventListener("click", () => onSelect(partner.id));
        targets.append(target);
        observer.observe(target);
        return {target, path};
      });
      observer.observe(source);
      observer.observe(network);
      setSelected(selected);
      network.hidden = !matches.length;
      if (!matches.length) status.textContent = en ? "No matching coauthors." : "Nenhum coautor encontrado.";
      else if (matches.length === 1) status.textContent = en ? "1 coauthor" : "1 coautor";
      else status.textContent = `${first + 1}–${first + subset.length} ${en ? "of" : "de"} ${matches.length} ${en ? "coauthors" : "coautores"}`;
      pager.hidden = partners.length <= pageSize && partners.length > 0;
      previous.hidden = next.hidden = matches.length <= pageSize;
      previous.disabled = page === 0;
      next.disabled = first + subset.length >= matches.length;
    }
    search.addEventListener("input", () => { page = 0; render(); });
    previous.addEventListener("click", () => { page--; render(); });
    next.addEventListener("click", () => { page++; render(); });
    render();
    return {
      element, setSelected,
      destroy() {
        observer.disconnect();
      }
    };
  };
})();
