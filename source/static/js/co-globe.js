/* Orthographic globe of the affiliations recorded on individual publications. */
(() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const views = new WeakMap();
  let nextId = 0;
  const bins = [1, 3, 10, 30, 100];
  const colors = ["#9ec7ec", "#69a5d7", "#3a85bf", "#19669d", "#07456f"];
  const radius = 159, maxHeight = 21, centre = 200;
  const viewSize = centre * 2, minZoom = 1, maxZoom = 6, zoomStep = 1.4;
  const radians = Math.PI / 180;
  const vectors = new WeakMap();
  const messages = {
    pt: {
      title: "Colaborações por país", list: "Países por número de artigos",
      zoomIn: "Aumentar zoom", zoomOut: "Diminuir zoom", zoomLevel: "Nível de zoom",
      world: "Globo dos países das instituições dos coautores",
      legend: "Artigos por país", missing: "Sem registro", choose: "Selecione um país para ver os artigos.",
      empty: "Nenhum país identificado neste recorte.", noPapers: "Nenhum artigo com afiliação identificada neste país neste recorte.",
      method: "Cada artigo conta uma vez em cada país de afiliação identificado para os coautores. Um artigo pode aparecer em vários países.",
      papers: n => n === 1 ? "1 artigo" : `${n} artigos`,
      left: "Girar para oeste", right: "Girar para leste", reset: "Restaurar vista",
      selected: "Artigos com coautores neste país", cartography: "Cartografia do Natural Earth"
    },
    en: {
      title: "Collaborations by country", list: "Countries by number of papers",
      zoomIn: "Zoom in", zoomOut: "Zoom out", zoomLevel: "Zoom level",
      world: "Globe showing the countries of co-authors’ institutions",
      legend: "Papers per country", missing: "No record", choose: "Select a country to see its papers.",
      empty: "No country identified for this selection.", noPapers: "No paper with an identified affiliation in this country for this selection.",
      method: "Each paper counts once in each country identified from its co-authors’ affiliations. One paper may appear in several countries.",
      papers: n => n === 1 ? "1 paper" : `${n} papers`,
      left: "Rotate west", right: "Rotate east", reset: "Reset view",
      selected: "Papers with co-authors in this country", cartography: "Map by Natural Earth"
    }
  };

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = content;
    return node;
  }

  function svgElement(tag, attributes = {}) {
    const node = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    return node;
  }

  function color(count) {
    if (!count) return "var(--cg-land)";
    return colors[bins.filter(lower => count >= lower).length - 1];
  }

  // Cartesian unit vectors keep the wall meshes attached to their geographic
  // borders during rotation. Subdivide long geodesic edges before projection.
  function borderRings(unit) {
    if (vectors.has(unit)) return vectors.get(unit);
    const rings = [];
    function append(points, a, b) {
      if (a[0]*b[0] + a[1]*b[1] + a[2]*b[2] < Math.cos(4*radians)) {
        const v = a.map((value,i) => value+b[i]), length = Math.hypot(...v);
        const mid = v.map(value => value/length);
        append(points,a,mid);
        append(points,mid,b);
      } else points.push(b);
    }
    for (const polygon of unit.polygons) for (const ring of polygon) {
      const points = [];
      for (const [lon,lat] of ring) {
        const c = Math.cos(lat*radians);
        const xyz = [c*Math.cos(lon*radians), c*Math.sin(lon*radians), Math.sin(lat*radians)];
        if (points.length) append(points,points[points.length-1],xyz);
        else points.push(xyz);
      }
      rings.push(points);
    }
    vectors.set(unit,rings);
    return rings;
  }

  function visibleWalls(rings, camera, height) {
    const front = [], back = [];
    const {clon,slon,clat,slat} = camera;
    const farLimit = -Math.sqrt(1 - (radius / (radius+height))**2);
    function rotate([x,y,z]) {
      const east = -x*slon + y*clon, meridian = x*clon + y*slon;
      return [east, meridian*slat - z*clat, meridian*clat + z*slat];
    }
    for (const ring of rings) {
      let a = rotate(ring[0]), run, previous;
      function add(side, p, q) {
        if (!run || p !== previous || run.side !== side) {
          run = {side, points:[p]};
          side.push(run.points);
        }
        run.points.push(q);
        previous = q;
      }
      for (let i=1; i<ring.length; i++) {
        const b = rotate(ring[i]);
        // Ignore walls facing away from the viewer.
        if (a[0]*b[1] < a[1]*b[0] && Math.max(a[2],b[2]) > farLimit-0.07) {
          if ((a[2] < 0) === (b[2] < 0)) add(a[2] < 0 ? back : front,a,b);
          else {
            const t = a[2] / (a[2]-b[2]);
            const x = a[0]+t*(b[0]-a[0]), y = a[1]+t*(b[1]-a[1]);
            const length = Math.hypot(x,y), horizon = [x/length,y/length,0];
            add(a[2] < 0 ? back : front,a,horizon);
            add(b[2] < 0 ? back : front,horizon,b);
          }
        }
        a = b;
      }
    }
    return {front,back};
  }

  function wallPath(runs, bottom, top) {
    let result = "";
    const project = (p,r) => Math.round((centre+p[0]*r)*10)/10 + "," + Math.round((centre+p[1]*r)*10)/10;
    for (const run of runs) {
      result += "M" + project(run[0],bottom);
      for (let i=1;i<run.length;i++) result += "L" + project(run[i],bottom);
      for (let i=run.length-1;i>=0;i--) result += "L" + project(run[i],top);
      result += "Z";
    }
    return result;
  }

  function appendLink(container, url, text, className) {
    if (!url || !/^https?:\/\//i.test(url)) return container.append(element("span", className, text));
    const anchor = element("a", className, text);
    anchor.href = url;
    container.append(anchor);
  }

  function render(root, {lang = "pt", countries = [], gaps = [], maxCountryCount = 0}) {
    const previous = views.get(root);
    if (previous?.frame) cancelAnimationFrame(previous.frame);
    const locale = lang.startsWith("en") ? "en" : "pt";
    const m = messages[locale];
    const format = new Intl.DisplayNames([locale], {type: "region"});
    const units = window.coGlobeMap || [];
    const byCode = new Map(units.map(unit => [unit.code, unit]));
    const nameOf = code => /^[A-Z]{2}$/.test(code) ? format.of(code) : byCode.get(code)?.name || code;
    const entries = countries.map(entry => ({
      code: entry.code.toUpperCase(),
      papers: [...new Map(entry.papers.map(paper => [paper.id, paper])).values()].sort(
        (a,b) => b.year - a.year || a.title.localeCompare(b.title, locale)
      )
    })).filter(entry => entry.papers.length);
    const byCountry = new Map(entries.map(entry => [entry.code, entry.papers]));
    entries.sort((a,b) => b.papers.length - a.papers.length || nameOf(a.code).localeCompare(nameOf(b.code), locale));
    const maximum = entries[0]?.papers.length || 0;
    const view = {
      centre: previous?.centre || [...byCode.get("BR").centre], selected: byCountry.has(previous?.selected) ? previous.selected : null, frame: 0,
      reference: Math.max(1,maxCountryCount,previous?.reference || 0,maximum),
      zoom: previous?.zoom || minZoom, left: previous?.left || 0, top: previous?.top || 0
    };
    views.set(root, view);
    root.classList.add("co-globe");
    const prefix = "co-globe-" + (++nextId);
    const heading = element("h2", "cg-title", m.title);
    const scope = element("p", "cg-scope", m.method);
    const body = element("div", "cg-world-layout");
    const plot = element("div", "cg-plot");
    const countryPane = element("div", "cg-country-pane");
    body.append(plot, countryPane);
    const detail = element("div", "cg-paper-panel");
    detail.setAttribute("role","region");
    detail.setAttribute("aria-label", m.selected);
    root.replaceChildren(heading, scope, body, detail);
    if (gaps.length) {
      const notes = element("details", "cg-gaps");
      const label = lang === "en" ? "Papers with missing affiliation countries" : "Artigos com afiliações sem país identificado";
      notes.append(element("summary", "", label + " (" + gaps.length + ")"));
      const list = element("ul");
      for (const gap of gaps) {
        const row = element("li");
        appendLink(row, gap.url, gap.year + " · " + gap.title, "");
        row.append(element("div", "cg-scope", gap.authors.join(", ")));
        list.append(row);
      }
      notes.append(list);
      scope.after(notes);
    }
    const svg = svgElement("svg", {class:"cg-earth", viewBox:"0 0 400 400", tabindex:"0", role:"group",
      "aria-label":m.world});
    const defs = svgElement("defs");
    const shadeId = prefix + "-shade";
    const shade = svgElement("radialGradient", {id:shadeId, cx:"36%", cy:"30%", r:"70%"});
    for (const [offset, opacity] of [["0%",0],["60%",0],["100%",0.24]]) {
      shade.append(svgElement("stop",{offset,"stop-color":"#20354a","stop-opacity":opacity}));
    }
    defs.append(shade);
    const brazilId = prefix + "-brazil";
    const brazil = svgElement("linearGradient", {id:brazilId, x1:"15%", y1:"10%", x2:"85%", y2:"95%"});
    for (const [offset, tint] of [["0%", "#7ebd9c"], ["50%", "#b9ce94"], ["100%", "#e5d785"]]) {
      brazil.append(svgElement("stop", {offset, "stop-color":tint}));
    }
    defs.append(brazil);
    const farWalls = svgElement("g",{"aria-hidden":"true"});
    svg.append(defs,farWalls,svgElement("circle",{cx:centre,cy:centre,r:radius,class:"cg-ocean"}));
    const grid = svgElement("path",{class:"cg-graticule","aria-hidden":"true"});
    const lands = svgElement("g",{"aria-hidden":"true"});
    const shadeLayer = svgElement("circle",{cx:centre,cy:centre,r:radius,fill:`url(#${shadeId})`,"pointer-events":"none"});
    const relief = svgElement("g",{"aria-hidden":"true"});
    const labels = svgElement("g", {class:"cg-country-labels", "aria-hidden":"true"});
    svg.append(grid,lands,shadeLayer,relief,labels);
    plot.append(svg);
    const controls = element("div","cg-rotation");
    const physicalBtn = (symbol, name, fn) => {
      const button = element("button","",symbol);
      button.type = "button";
      button.title = name;
      button.setAttribute("aria-label",name);
      button.addEventListener("click",fn);
      return button;
    };
    const less = physicalBtn("−",m.zoomOut,() => changeZoom(view.zoom/zoomStep));
    const more = physicalBtn("+",m.zoomIn,() => changeZoom(view.zoom*zoomStep));
    const zoomLevel = element("output","cg-zoom-level");
    zoomLevel.setAttribute("aria-label",m.zoomLevel);
    zoomLevel.setAttribute("aria-live","off");
    controls.append(
      physicalBtn("←",m.left,() => shift(-24,0)),
      physicalBtn("↺",m.reset,resetView),
      physicalBtn("→",m.right,() => shift(24,0)), less, zoomLevel, more
    );
    function applyViewport() {
      const size = viewSize/view.zoom;
      svg.setAttribute("viewBox",[view.left,view.top,size,size].join(" "));
      zoomLevel.textContent = Math.round(view.zoom*100)+"%";
      less.setAttribute("aria-disabled", String(view.zoom <= minZoom));
      more.setAttribute("aria-disabled", String(view.zoom >= maxZoom));
    }
    function position(clientX, clientY) {
      const box = svg.getBoundingClientRect();
      return [(clientX-box.left)/box.width, (clientY-box.top)/box.height];
    }
    function anchor([x,y]) {
      const size = viewSize/view.zoom;
      return [view.left + x*size, view.top + y*size];
    }
    function changeZoom(value, location = [.5,.5], fixed = anchor(location)) {
      view.zoom = Math.max(minZoom,Math.min(maxZoom,value));
      const size = viewSize/view.zoom;
      const clamp = n => Math.max(0, Math.min(viewSize-size,n));
      view.left = clamp(fixed[0]-location[0]*size);
      view.top = clamp(fixed[1]-location[1]*size);
      applyViewport();
      requestDraw();
    }
    function resetView() {
      view.centre = [...byCode.get("BR").centre];
      changeZoom(minZoom);
      requestDraw();
    }
    applyViewport();
    plot.append(controls);
    const legend = element("div","cg-map-legend");
    legend.setAttribute("aria-label",m.legend);
    function addBin(label, tint) {
      const item = element("span","cg-bin");
      const dot = element("i");
      dot.style.backgroundColor = tint;
      item.append(dot,document.createTextNode(label));
      legend.append(item);
    }
    addBin(m.missing,"var(--cg-land)");
    bins.forEach((lower,i) => {
      if (lower > maximum) return;
      const upper = Math.min(maximum, (bins[i+1] || Infinity)-1);
      const label = lower === upper ? String(lower) : lower + "–" + upper;
      addBin(label, colors[i]);
    });
    plot.append(legend);
    const source = element("p","cg-cartography");
    appendLink(source,"https://www.naturalearthdata.com/",m.cartography,"");
    plot.append(source);

    const d3 = window.coGlobeD3;
    const projection = d3.geoOrthographic().translate([centre,centre]).scale(radius).precision(.25);
    const path = d3.geoPath(projection).digits(1);
    const graticule = d3.geoGraticule().step([30,30])();
    const shapes = new Map();
    for (const unit of units) {
      const geometry = {type:"MultiPolygon", coordinates:unit.polygons};
      const count = byCountry.get(unit.code)?.length || 0;
      const height = maxHeight * count / view.reference;
      const shape = svgElement("path",{class:"cg-land", "data-code":unit.code, "data-count":count,
        "data-height":height, fill:unit.code === "BR" ? `url(#${brazilId})` : color(count)});
      const title = svgElement("title");
      title.textContent = nameOf(unit.code) + " · " + m.papers(count);
      shape.append(title);
      if (count) shape.setAttribute("transform","translate("+centre+" "+centre+") scale("+
        (1+height/radius)+") translate("+(-centre)+" "+(-centre)+")");
      else lands.append(shape);
      const label = svgElement("g", {class:"cg-country-label", "data-code":unit.code});
      const leader = svgElement("path", {class:"cg-label-leader"});
      const text = svgElement("text", {"text-anchor":"middle", "dominant-baseline":"central"});
      text.textContent = unit.code;
      const labelTitle = svgElement("title");
      labelTitle.textContent = nameOf(unit.code);
      label.append(leader, text, labelTitle);
      labels.append(label);
      shapes.set(unit.code,{unit, shape, geometry, height, count, label, leader, text});
    }

    const raised = [...shapes.values()].filter(piece => piece.height>0);
    const levels = [...new Set(raised.map(piece => piece.height))].sort((a,b)=>a-b);
    const bands = [];
    let lower = 0;
    for (const upper of levels) {
      const backBand = svgElement("g"), frontBand = svgElement("g");
      // On the far hemisphere the lowest visible radius is nearest. The ocean
      // and base lands then hide all back walls except protrusions at the limb.
      farWalls.prepend(backBand);
      relief.append(frontBand);
      for (const piece of raised) {
        if (piece.height < upper) continue;
        const wallColor = piece.unit.code === "BR" ? "#7ebd9c" : color(piece.count);
        const attrs = {class:"cg-relief-wall","data-code":piece.unit.code,fill:"color-mix(in srgb, "+wallColor+" 68%, #071522)"};
        const back = svgElement("path",attrs), front = svgElement("path",attrs);
        frontBand.append(front); backBand.append(back);
        // Subpixel overlap avoids hairline cracks between adjacent wall strips.
        bands.push({piece,front,back,lower:radius+Math.max(0,lower-.35),upper:radius+upper});
      }
      for (const piece of raised) if (piece.height === upper) relief.append(piece.shape);
      lower = upper;
    }

    function paintLabels(camera) {
      const fontSize = 12 * viewSize / Math.max(1, svg.getBoundingClientRect().width) / view.zoom;
      const labelWidth = fontSize * 2.1, labelHeight = fontSize * 1.35;
      const viewportSize = viewSize / view.zoom;
      const candidates = [];
      for (const piece of shapes.values()) {
        piece.label.style.display = "none";
        if (!piece.count) continue;
        const [lon,lat] = piece.unit.centre.map(value => value*radians);
        const depth = Math.cos(lat)*(Math.cos(lon)*camera.clon+Math.sin(lon)*camera.slon)*camera.clat + Math.sin(lat)*camera.slat;
        if (depth <= .04) continue;
        const projected = projection(piece.unit.centre), scale = 1 + piece.height/radius;
        const x = centre + (projected[0]-centre)*scale, y = centre + (projected[1]-centre)*scale;
        if (x < view.left || x > view.left+viewportSize || y < view.top || y > view.top+viewportSize) continue;
        const area = path.area(piece.geometry)*scale*scale;
        candidates.push({piece, x, y, area, small:area < fontSize*fontSize*6});
      }
      candidates.sort((a,b) => Number(b.piece.unit.code === view.selected)-Number(a.piece.unit.code === view.selected)
        || Number(a.small)-Number(b.small) || b.piece.count-a.piece.count || b.area-a.area);
      const occupied = [];
      const directions = [[1,0],[-1,0],[0,-1],[0,1],[1,-1],[-1,-1],[1,1],[-1,1]];
      for (const {piece, x, y, small} of candidates) {
        const positions = small ? [] : [[x,y]];
        for (const distance of [2.1,3.6,5.1,6.6,8.1]) {
          for (const [dx,dy] of directions) positions.push([x+dx*distance*fontSize, y+dy*distance*fontSize]);
        }
        const position = positions.find(([px,py]) => {
          if (px-labelWidth/2 < view.left || px+labelWidth/2 > view.left+viewportSize
              || py-labelHeight/2 < view.top || py+labelHeight/2 > view.top+viewportSize) return false;
          return occupied.every(box => Math.abs(px-box.x) >= labelWidth || Math.abs(py-box.y) >= labelHeight);
        });
        if (!position) continue;
        const [px,py] = position;
        occupied.push({x:px,y:py});
        piece.label.style.display = "";
        piece.text.setAttribute("x",px);
        piece.text.setAttribute("y",py);
        piece.text.setAttribute("font-size",fontSize);
        piece.text.setAttribute("stroke-width",fontSize*.22);
        piece.leader.setAttribute("d",px === x && py === y ? "" : `M${x},${y}L${px},${py}`);
      }
    }

    function paint() {
      const [lon,lat] = view.centre.map(n => n*radians);
      const camera = {clon:Math.cos(lon),slon:Math.sin(lon),clat:Math.cos(lat),slat:Math.sin(lat)};
      projection.rotate([-view.centre[0],-view.centre[1]]);
      grid.setAttribute("d",path(graticule) || "");
      for (const piece of shapes.values()) {
        piece.shape.setAttribute("d",path(piece.geometry) || "");
        piece.shape.classList.toggle("is-selected", piece.unit.code===view.selected);
        if (piece.height) piece.walls=visibleWalls(borderRings(piece.unit), camera, piece.height);
      }
      for (const band of bands) {
        band.front.setAttribute("d",wallPath(band.piece.walls.front,band.lower,band.upper));
        band.back.setAttribute("d",wallPath(band.piece.walls.back,band.lower,band.upper));
      }
      paintLabels(camera);
      view.frame = 0;
    }
    function requestDraw() {
      if (view.frame === 0) view.frame=requestAnimationFrame(paint);
    }
    function shift(dx,dy) {
      view.centre = [(view.centre[0]+dx+540)%360-180, Math.min(88,Math.max(-88,view.centre[1]+dy))];
      requestDraw();
    }
    svg.addEventListener("keydown", event => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (["+", "=", "-", "−", "0", "Home"].includes(event.key)) {
        event.preventDefault();
        if (event.key === "0" || event.key === "Home") resetView();
        else changeZoom((event.key === "-" || event.key === "−") ? view.zoom/zoomStep : view.zoom*zoomStep);
        return;
      }
      const delta = {ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,10],ArrowDown:[0,-10]}[event.key];
      if (!delta) return;
      event.preventDefault();
      shift(...delta);
    });
    svg.addEventListener("wheel", event => {
      if (!event.deltaY) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? svg.clientHeight : 1;
      const delta = Math.max(-240,Math.min(240,event.deltaY*unit));
      const next = Math.max(minZoom,Math.min(maxZoom,view.zoom*Math.exp(-delta*0.0025)));
      if (next === view.zoom && !event.ctrlKey) return;
      event.preventDefault();
      changeZoom(next,position(event.clientX,event.clientY));
    },{passive:false});

    const pointers = new Map();
    let pinch = null;
    function pairPosition() {
      const [a,b] = pointers.values();
      return {distance:Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)), midpoint:position((a.x+b.x)/2,(a.y+b.y)/2)};
    }
    function startDrag(point) {
      point.startX = point.x; point.startY = point.y;
      point.lon = view.centre[0]; point.lat = view.centre[1];
    }
    svg.addEventListener("pointerdown", event => {
      if (event.button !== 0 || pointers.size >= 2) return;
      const pointer = {x:event.clientX, y:event.clientY, dragging:false};
      pointers.set(event.pointerId,pointer);
      startDrag(pointer);
      svg.setPointerCapture(event.pointerId);
      if (pointers.size === 2) {
        const {distance,midpoint} = pairPosition();
        pinch = {distance, zoom:view.zoom, fixed:anchor(midpoint)};
        for (const p of pointers.values()) p.dragging=true;
      }
    });
    svg.addEventListener("pointermove",event => {
      const pointer = pointers.get(event.pointerId);
      if (!pointer) return;
      pointer.x = event.clientX; pointer.y = event.clientY;
      if (pinch) {
        const {distance,midpoint} = pairPosition();
        changeZoom(pinch.zoom*distance/pinch.distance,midpoint,pinch.fixed);
        return;
      }
      const dx = pointer.x-pointer.startX, dy = pointer.y-pointer.startY;
      if(!pointer.dragging && Math.hypot(dx,dy)<4) return;
      pointer.dragging = true;
      svg.classList.add("is-dragging");
      const scale = 150 / Math.max(1,svg.getBoundingClientRect().width*view.zoom);
      view.centre = [(pointer.lon-dx*scale+540)%360-180,Math.min(88,Math.max(-88,pointer.lat+dy*scale))];
      requestDraw();
    });
    function finishPointer(event) {
      const pointer = pointers.get(event.pointerId);
      if (!pointer) return;
      if (event.type === "pointerup" && !pointer.dragging) {
        const hit = document.elementFromPoint(event.clientX,event.clientY)?.closest("[data-code]");
        if (hit && svg.contains(hit)) choose(hit.dataset.code,false);
      }
      pointers.delete(event.pointerId);
      pinch = null;
      for (const remaining of pointers.values()) startDrag(remaining);
      if (!pointers.size) svg.classList.remove("is-dragging");
    }
    for (const type of ["pointerup","pointercancel","lostpointercapture"]) svg.addEventListener(type, finishPointer);

    countryPane.append(element("h3","cg-list-title",m.list));
    const rankList = element("ul","cg-rank-list");
    const buttons = new Map();
    for(const {code,papers} of entries) {
      const li = element("li");
      const button = element("button","cg-rank");
      button.type="button";
      button.setAttribute("aria-label",nameOf(code) + " · " + m.papers(papers.length));
      button.setAttribute("aria-pressed","false");
      button.style.setProperty("--cg-width", (100*papers.length/maximum)+"%");
      button.addEventListener("click",() => choose(code,true));
      button.append(element("span","cg-country-name",nameOf(code)),element("strong","cg-count",papers.length),
                    element("span","cg-bar"));
      li.append(button); rankList.append(li); buttons.set(code,button);
    }
    countryPane.append(rankList);
    if (!entries.length) countryPane.append(element("p","cg-no-data",m.empty));
    const notify = element("p","cg-screen-reader");
    notify.setAttribute("role","status");
    countryPane.append(notify);

    function showDetail(code) {
      detail.replaceChildren();
      if (!code) { detail.append(element("p","cg-choose",m.choose)); return; }
      const papers = byCountry.get(code) || [];
      detail.append(element("h3","cg-detail-title",nameOf(code) + " · " + m.papers(papers.length)));
      if (!papers.length) { detail.append(element("p","cg-choose",m.noPapers)); return; }
      const list = element("ol","cg-papers");
      for (const paper of papers) {
        const li = element("li");
        li.append(element("span","cg-paper-year",paper.year));
        appendLink(li,paper.url,paper.title,"cg-paper-title");
        const meta=element("div","cg-paper-meta");
        if(paper.affiliations?.length) {
          for (const {name, institutions} of paper.affiliations) {
            const row = element("div","cg-affiliation");
            row.append(element("span","",name));
            if (institutions?.length) row.append(document.createTextNode(" · " + institutions.join(", ")));
            meta.append(row);
          }
        } else if(paper.contributors?.length) {
          meta.append(document.createTextNode(paper.contributors.join(", ")));
        }
        if(meta.childNodes.length) li.append(meta);
        list.append(li);
      }
      detail.append(list);
    }
    function highlightCountry(code) {
      const button = buttons.get(code);
      if (!button) return;
      button.setAttribute("aria-pressed","true");
      const bounds = rankList.getBoundingClientRect(), selected = button.getBoundingClientRect();
      if (selected.top < bounds.top) rankList.scrollTop += selected.top-bounds.top;
      else if (selected.bottom > bounds.bottom) rankList.scrollTop += selected.bottom-bounds.bottom;
    }
    function choose(code, centre) {
      if (buttons.has(view.selected)) buttons.get(view.selected).setAttribute("aria-pressed","false");
      view.selected=code;
      highlightCountry(code);
      if (centre && byCode.has(code)) {
        view.centre = [...byCode.get(code).centre];
        changeZoom(view.zoom,[.5,.5],[viewSize/2,viewSize/2]);
      }
      requestDraw();
      showDetail(code);
      notify.textContent=nameOf(code) + " · " + m.papers(byCountry.get(code)?.length || 0);
    }
    highlightCountry(view.selected);
    paint();
    showDetail(view.selected);
  }

  window.renderCollaborationGlobe = render;
})();
