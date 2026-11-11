/* Data-only history views: no analytics, remote requests or external dependencies. */
(() => {
  'use strict';
  const host = document.querySelector('.community-history');
  if (!host) return;
  const en = host.dataset.lang === 'en', lang = en ? 'en' : 'pt';
  const t = (pt, english) => en ? english : pt;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const local = value => typeof value === 'object' && value !== null ? value[lang] || value.pt || '' : value || '';
  const date = value => new Intl.DateTimeFormat(en?'en-GB':'pt-BR',{timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
  const options = (rows, value='', name='') => rows.map(r => `<option value="${esc(r[value] ?? r[0])}">${esc(r[name] ?? r[1])}</option>`).join('');
  const select = (id,label,values,wide=false) => `<label${wide?' class="ch-wide"':''}>${label}<select data-filter="${id}">${options(values)}</select></label>`;
  const all = label => [['',label]];
  const periodCaveat = r => { const status=r.verification?.startYearStatus || ''; return status === 'preserved_legacy_not_independently_verified' ? t('Período legado; o ano inicial não foi confirmado por uma fonte independente.','Legacy period; the start year has not been independently confirmed.') : ['supported_by_admission_cohort_not_enrollment_certificate','supported_by_prior_institutional_supervision_record_2017'].includes(status) ? t('O início informado indica admissão ou presença em registro institucional, não necessariamente o início da orientação.','The reported start indicates admission or presence in an institutional record, not necessarily the start of supervision.') : ''; };
  const stayStatus = r => r.status ? (r.status==='current'?t('Em andamento','Ongoing'):t('Concluído','Completed')) : '';
  const download = (filename, rows) => {
    const cell = x => '"'+String(x??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
    const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };
  const yearsOf = records => { const years=records.map(r=>Number(r.year)).filter(Number.isFinite); return years.length ? Array.from({length:Math.max(...years)-Math.min(...years)+1},(_,i)=>Math.min(...years)+i) : []; };
  const groupYears = (records, years, cumulative) => {let total=0; return years.map(year=> {const n=records.filter(r=>Number(r.year)===year).length; total+=n;return {year,count:cumulative?total:n,annual:n};});};
  function chart(root, series, selected, cumulative, onSelect, showTable = true) {
    if(!series.length){root.replaceChildren();return;}
    const max=Math.max(1,...series.map(x=>x.count));
    // All bars reveal portions of the same bottom-aligned colour scale.
    // The first unit is uniformly light; higher values continue the gradient.
    const plotHeight=168;
    const gradient=max>1?`linear-gradient(to top,#bfdbfe 0px,#bfdbfe ${plotHeight/max}px,#1d4ed8 ${plotHeight}px)`:'none';
    root.innerHTML=`<div class="ch-chart-scroll" tabindex="0" role="group" aria-label="${t('Gráfico por ano. Selecione uma barra para ver os registros.','Chart by year. Select a bar to view records.')}"><div class="ch-chart" style="--ch-bar-scale-height:${plotHeight}px;--ch-bar-gradient:${gradient}">${series.map(x=>`<button type="button" class="ch-bar" data-year="${x.year}" aria-pressed="${x.year===selected}" aria-label="${x.year}: ${x.count} ${cumulative?t('acumulados; ver registros até este ano','cumulative; view records through this year'):t('registros; ver detalhes','records; view details')}"><span class="ch-bar-value">${x.count}</span><span class="ch-bar-fill" style="height:${x.count/max*plotHeight}px"></span><span class="ch-bar-year">${x.year}</span></button>`).join('')}</div></div>
      <p class="ch-caption">${t('Selecione uma barra para consultar os registros. Em telas menores, deslize o gráfico para os lados.','Select a bar to inspect records. On small screens, scroll the chart horizontally.')}</p>
      ${showTable ? `<details class="ch-data-table"><summary>${t('Ver tabela de valores','View data table')}</summary><div class="ch-table-scroll"><table><thead><tr><th>${t('Ano','Year')}</th><th>${t('No ano','In year')}</th>${cumulative?`<th>${t('Acumulado','Cumulative')}</th>`:''}</tr></thead><tbody>${series.map(x=>`<tr><td>${x.year}</td><td>${x.annual}</td>${cumulative?`<td>${x.count}</td>`:''}</tr>`).join('')}</tbody></table></div></details>` : ''}`;
    root.querySelectorAll('[data-year]').forEach(b=>b.addEventListener('click',()=>{const year=Number(b.dataset.year);onSelect(year);root.querySelector(`[data-year="${year}"]`)?.focus({preventScroll:true});}));
  }
  async function start() {
    const response=await fetch(host.dataset.source); if(!response.ok)throw new Error('HTTP '+response.status);
    const data=await response.json();
    const people=new Map(data.history.people.map(p=>[p.id,p]));
    const name=id=>people.get(id)?.name||id;
    const isPrimary = advisor => ['advisor','institutional'].includes(advisor.role) || (advisor.role==='joint' && advisor.formalRoleConfirmed!==false);
    const primaryAdvisors = record => record.advisors.filter(isPrimary);
    const trainingDegrees = data.history.degrees.filter(record=>primaryAdvisors(record).some(a=>people.get(a.personId)?.facultyId));
    const trainingPostdocs = data.history.postdocs.filter(record=>primaryAdvisors(record).length);
    const advisorText = record => {
      const groups=new Map();
      primaryAdvisors(record).forEach(a=>{const label=local(a.label)||t('Orientador','Advisor');if(!groups.has(label))groups.set(label,[]);groups.get(label).push(name(a.personId));});
      return [...groups].map(([label,names])=>`${label}: ${names.join(' / ')}`).join('\n');
    };
    const primaryNotes = record => record.advisors.some(a=>a.role==='joint'&&a.formalRoleConfirmed===false) ? '' : local(record.notes);
    const faculty=[...data.faculty].sort((a,b)=>a.name.localeCompare(b.name,lang));
    const facultyAll=[...(data.facultyAll||data.faculty)].sort((a,b)=>a.name.localeCompare(b.name,lang));
    const facultyOptions=all(t('Todos os docentes','All faculty members')).concat(facultyAll.map(p=>[p.id,p.name]));
    const latest=data.institutions.snapshots.at(-1);
    host.querySelector('[data-summary]').innerHTML=[
      [data.faculty.length,t('docentes catalogados','faculty members listed')],
      [data.publications.papers.length,t('artigos no catálogo','papers in the catalogue')],
      [trainingDegrees.length,t('titulações orientadas','supervised degrees')],
      [new Set(latest.members.map(m=>m.institution)).size,t('instituições no cadastro','institutions listed')]
    ].map(([n,label])=>`<span><strong>${n}</strong>${label}</span>`).join('');

    function formation(root) {
      let year=null, filtered=[], cumulative=false;
      const levels=[['degree',t('Titulações · todas','Degrees · all')],['phd',t('Doutorado','PhD')],['masters',t('Mestrado acadêmico','Academic master’s')],['professional-masters',t('Mestrado profissional','Professional master’s')],['postdoc',t('Pós-doutorado · registros','Postdoctoral stays · records')]];
      const institutions=[...new Set([...trainingDegrees,...trainingPostdocs].map(d=>d.institution))].sort();
      root.innerHTML=`<p class="ch-lead">${t('Titulações concluídas com orientação principal de docentes da comunidade.','Completed degrees under the primary supervision of community faculty.')}</p>
        <div class="ch-controls">${select('level',t('Formação','Training'),levels)}${select('advisor',t('Docente','Faculty member'),facultyOptions,true)}${select('institution',t('Instituição','Institution'),all(t('Todas','All')).concat(institutions.map(x=>[x,x])))}${select('mode',t('Contagem','Count'),[['annual',t('Por ano','Annual')],['cumulative',t('Acumulada','Cumulative')]])}</div>
        <p class="ch-caption" data-note></p><div class="ch-statline"><span data-total role="status"></span><button class="ch-download" type="button">${t('Baixar seleção · CSV','Download selection · CSV')}</button></div><div data-chart></div><div class="ch-records" data-records></div>`;
      const val=id=>root.querySelector(`[data-filter="${id}"]`).value;
      const labelLevel=level=>levels.find(x=>x[0]===level)?.[1]||level;
      function renderRecords() {
        const subset=filtered.filter(r=>year===null||(cumulative?r.year<=year:r.year===year));
        root.querySelector('[data-records]').innerHTML=`<h3>${year===null?t('Registros da seleção','Selected records'):(cumulative?t('Até ','Through '):'')+year} · ${subset.length}</h3>${year!==null?`<button type="button" class="ch-reset">${t('Ver todos os anos','Show all years')}</button>`:''}<div class="ch-record-list">${subset.length?subset.slice().sort((a,b)=>b.year-a.year||name(a.personId).localeCompare(name(b.personId))).map(r=>`<article class="ch-record"><strong>${esc(name(r.personId))}</strong><p>${esc(labelLevel(r.level||'postdoc'))} · ${esc(r.institution)} · ${r.year}${r.status?' · '+stayStatus(r):''}</p><p class="ch-subtext">${esc(advisorText(r)).replace(/\n/g,'<br>')}</p>${primaryNotes(r)?`<p class="ch-subtext">${esc(primaryNotes(r))}</p>`:''}<details><summary>${t('Período informado','Reported period')}</summary><p>${esc(local(r.displayPeriod))}</p>${periodCaveat(r)?`<p>${periodCaveat(r)}</p>`:''}</details></article>`).join(''):`<p>${t('Nenhum registro para estes filtros.','No records match these filters.')}</p>`}</div>`;
        root.querySelector('.ch-reset')?.addEventListener('click',()=>{year=null;renderChart();});
      }
      function renderChart(){chart(root.querySelector('[data-chart]'),groupYears(filtered,yearsOf(filtered),cumulative),year,cumulative,y=>{year=year===y?null:y;renderChart();});renderRecords();}
      function update(){
        year=null;cumulative=val('mode')==='cumulative';const postdoc=val('level')==='postdoc';
        filtered=(postdoc?trainingPostdocs.map(r=>({...r,year:r.reportedYear})):trainingDegrees).filter(r=>(postdoc||val('level')==='degree'||r.level===val('level'))&&(!val('institution')||r.institution===val('institution'))&&(!val('advisor')||primaryAdvisors(r).some(a=>people.get(a.personId)?.facultyId===val('advisor')||a.personId===val('advisor'))));
        root.querySelector('[data-total]').innerHTML=`<strong>${filtered.length}</strong> ${postdoc?t('registros de pós-doutorado','postdoctoral records'):t('titulações concluídas','completed degrees')}`;
        root.querySelector('[data-note]').textContent=postdoc?t('Pós-doutorado não é titulação. O gráfico usa o ano informado no registro; ele pode indicar conclusão ou situação em andamento. Não representa duração nem o número de pessoas ativas em cada ano.','A postdoc is not a degree. The chart uses the reported year, which may indicate completion or an ongoing stay. It does not represent duration or the number of people active each year.'):t('Ano de conclusão. A série é limitada aos registros cadastrados; não mede evasão nem o total de estudantes ativos. O ano corrente pode estar incompleto.','Completion year. The series is limited to recorded entries; it does not measure attrition or total active students. The current year may be incomplete.');
        renderChart();
      }
      root.querySelectorAll('select').forEach(s=>s.addEventListener('change',update));
      root.querySelector('.ch-download').addEventListener('click',()=>download('formacao.csv',[[t('Pessoa','Person'),t('Nível','Level'),t('Instituição','Institution'),t('Ano','Year'),t('Orientação','Supervision'),t('Situação','Status'),t('Período informado','Reported period'),t('Ressalva','Caveat')],...filtered.filter(r=>year===null||(cumulative?r.year<=year:r.year===year)).map(r=>[name(r.personId),labelLevel(r.level||'postdoc'),r.institution,r.year,advisorText(r),stayStatus(r),local(r.displayPeriod),periodCaveat(r)])]));
      update();
    }
    function publications(root) {
      let year=null,filtered=[],cumulative=false;
      const papers=[...new Map(data.publications.papers.map(p=>[p.id,p])).values()];
      root.innerHTML=`<p class="ch-lead">${t('A produção registrada por ano e por docente. Cada artigo conta uma vez, mesmo quando tem vários autores da comunidade.','The papers recorded by year and faculty member. Each paper counts once, even when it has several community authors.')}</p><div class="ch-controls">${select('faculty',t('Docente','Faculty member'),facultyOptions,true)}${select('mode',t('Contagem','Count'),[['annual',t('Por ano','Annual')],['cumulative',t('Acumulada','Cumulative')]])}</div><div class="ch-statline"><span data-total role="status"></span><button type="button" class="ch-download">${t('Baixar seleção · CSV','Download selection · CSV')}</button></div><div data-chart></div><p class="ch-caption">${t('Ano do registro no catálogo: pode corresponder ao preprint ou à publicação no periódico. O ano corrente pode estar incompleto.','Catalogue year: this may be the preprint or journal publication year. The current year may be incomplete.')}</p><div class="ch-records" data-records></div>`;
      function render(){
        chart(root.querySelector('[data-chart]'),groupYears(filtered,yearsOf(papers),cumulative),year,cumulative,y=>{year=year===y?null:y;render();});
        const subset=filtered.filter(p=>year===null||(cumulative?p.year<=year:p.year===year));
        root.querySelector('[data-records]').innerHTML=`<h3>${year===null?t('Artigos da seleção','Selected papers'):(cumulative?t('Até ','Through '):'')+year} · ${subset.length}</h3>${year!==null?`<button class="ch-reset" type="button">${t('Ver todos os anos','Show all years')}</button>`:''}<div class="ch-record-list">${subset.length?subset.slice().sort((a,b)=>b.year-a.year||a.title.localeCompare(b.title)).map(p=>`<article class="ch-record"><a href="${esc(p.url)}">${esc(p.title)}</a><p class="ch-subtext">${esc(p.authors.map(a=>a.name).join(', '))} · ${p.year}</p></article>`).join(''):`<p>${t('Nenhum artigo neste ano.','No papers in this year.')}</p>`}</div>`;
        root.querySelector('.ch-reset')?.addEventListener('click',()=>{year=null;render();});
      }
      function update(){year=null;cumulative=root.querySelector('[data-filter="mode"]').value==='cumulative';const id=root.querySelector('[data-filter="faculty"]').value;filtered=papers.filter(p=>!id||p.faculty.includes(id));root.querySelector('[data-total]').innerHTML=`<strong>${filtered.length}</strong> ${t('artigos distintos','distinct papers')}`;render();}
      root.querySelectorAll('select').forEach(s=>s.addEventListener('change',update));
      root.querySelector('.ch-download').addEventListener('click',()=>download('artigos.csv',[[t('Título','Title'),t('Autores','Authors'),t('Ano','Year'),'URL'],...filtered.filter(p=>year===null||(cumulative?p.year<=year:p.year===year)).map(p=>[p.title,p.authors.map(a=>a.name).join('; '),p.year,p.url])]));update();
    }
    function institutions(root){
      let state='';
      const snapshot=latest;
      root.innerHTML=`<p class="ch-lead">${t('Estados dos docentes catalogados.','States of the listed faculty members.')}</p><div class="ch-statline" data-total role="status"></div><div class="ch-institution-grid"><div><div class="ch-map"></div><div class="ch-state-buttons"></div></div><div class="ch-institution-list"></div></div><p class="ch-caption">${t('Dados do cadastro de','Directory data as of')} ${date(snapshot.date)}.</p>`;
      root.querySelector('.ch-map').append(host.querySelector('[data-map-template]').content.cloneNode(true));
      const svg=root.querySelector('svg');svg.setAttribute('role','group');svg.setAttribute('aria-label',t('Estados com docentes catalogados. Selecione um estado.','States with listed faculty members. Select a state.'));
      function render(){
        const members=snapshot.members.filter(m=>!state||m.state===state),states=[...new Set(snapshot.members.map(m=>m.state))].sort();
        root.querySelector('[data-total]').innerHTML=`<span><strong>${members.length}</strong> ${t('docentes','faculty members')} · ${new Set(members.map(m=>m.institution)).size} ${t('instituições','institutions')} · ${state?data.institutions.states[state]:states.length+' '+t('estados','states')}</span>`;
        root.querySelector('.ch-state-buttons').innerHTML=[['',t('Todos','All')],...states.map(uf=>[uf,uf])].map(([id,label])=>`<button type="button" class="ch-state-button" data-state-select="${id}" aria-pressed="${state===id}">${label}</button>`).join('');
        root.querySelectorAll('[data-state-select]').forEach(b=>b.addEventListener('click',()=>{state=b.dataset.stateSelect;render();}));
        svg.querySelectorAll('[data-state]').forEach(p=>{const uf=p.dataset.state,known=states.includes(uf);p.style.opacity=state&&uf!==state?'.3':'1';p.setAttribute('fill',known?'#bfdbfe':'#eef2f6');if(known){p.setAttribute('role','button');p.setAttribute('tabindex','0');p.setAttribute('aria-label',data.institutions.states[uf]);p.setAttribute('aria-pressed',String(state===uf));p.onclick=()=>{state=state===uf?'':uf;render();};p.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();p.onclick();}};}});
        const names=[...new Set(members.map(m=>m.institution))].sort();root.querySelector('.ch-institution-list').innerHTML=`<h3>${state?esc(data.institutions.states[state]):t('Instituições e docentes','Institutions and faculty')}</h3><div class="ch-institution-groups">${names.map(institution=>`<div class="ch-institution-group"><h4>${esc(institution)} <span class="ch-caption">· ${members.find(m=>m.institution===institution).state}</span></h4><ul>${members.filter(m=>m.institution===institution).map(m=>faculty.find(f=>f.id===m.facultyId)||people.get(m.facultyId)).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name)).map(f=>`<li><a href="${esc(f.url)}">${esc(f.name)}</a></li>`).join('')}</ul></div>`).join('')}</div>`;
      }
      render();
    }
    function awards(root){
      let year=null,filtered=[];
      const records=data.awards?.records||[];
      const facultyIds=new Set(facultyAll.map(p=>p.id));
      const superviseeIds=new Set(records.flatMap(r=>r.recipients).filter(p=>!facultyIds.has(p.personId)&&p.degreeId).map(p=>p.personId));
      const recipientName=p=>people.get(p.personId)?.name||p.name||p.personId;
      const normalize=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase(lang);
      const categories={research:t('Pesquisa','Research'),book:t('Livros','Books'),paper:t('Artigos e trabalhos em eventos','Papers and conference contributions'),phd:t('Teses de doutorado','Doctoral theses'),masters:t('Dissertações de mestrado','Master’s dissertations'),academy:t('Academia Brasileira de Ciências','Brazilian Academy of Sciences'),other:t('Outras premiações acadêmicas','Other academic awards')};
      const recipientList=[...new Map(records.flatMap(r=>r.recipients).map(p=>[p.personId,[p.personId,recipientName(p)]])).values()].sort((a,b)=>a[1].localeCompare(b[1],lang));
      const kinds=Object.entries(categories).filter(([key])=>records.some(r=>r.category===key));
      root.innerHTML=`<p class="ch-lead">${t('Prêmios e distinções acadêmicas dos docentes da comunidade e de orientandos e ex-orientandos','Academic awards and honours of community faculty, supervisees and former supervisees')}</p>
        <div class="ch-controls">${select('recipient',t('Pessoa premiada','Recipient'),all(t('Todas as pessoas','All recipients')).concat(recipientList),true)}${select('category',t('Tipo de prêmio','Award type'),all(t('Todos','All')).concat(kinds))}${select('group',t('Premiados','Recipients'),[['',t('Docentes e orientandos','Faculty and students')],['faculty',t('Docentes','Faculty')],['student',t('Orientandos e ex-orientandos','Students and former students')]])}<label class="ch-wide">${t('Buscar','Search')}<input data-filter="query" type="search" placeholder="${t('Nome, prêmio ou trabalho','Name, award or work title')}" autocomplete="off"></label></div>
        <div class="ch-statline"><span data-total role="status" aria-live="polite"></span><button type="button" class="ch-download">${t('Baixar seleção · CSV','Download selection · CSV')}</button></div><div data-chart></div><div class="ch-records ch-awards" data-records></div>`;
      const val=id=>root.querySelector(`[data-filter="${id}"]`).value;
      function selectedRecords(){return filtered.filter(r=>year===null||r.year===year);}
      function render(){
        chart(root.querySelector('[data-chart]'),groupYears(filtered,yearsOf(filtered),false),year,false,y=>{year=year===y?null:y;render();},false);
        const subset=selectedRecords().slice().sort((a,b)=>b.year-a.year||local(a.title).localeCompare(local(b.title),lang));
        root.querySelector('[data-total]').innerHTML=`<strong>${filtered.length}</strong> ${t('prêmios e distinções registrados','awards and honours recorded')}`;
        root.querySelector('[data-records]').innerHTML=`<h3>${year===null?t('Premiações da seleção','Selected awards'):year} · ${subset.length}</h3>${year!==null?`<button type="button" class="ch-reset">${t('Ver todos os anos','Show all years')}</button>`:''}<div class="ch-record-list">${subset.length?subset.map(r=>`<article class="ch-record" data-award-id="${esc(r.id)}"><p class="ch-award-meta">${r.year} · ${esc(categories[r.category]||r.category)}</p><h4>${esc(local(r.title))}</h4><p class="ch-award-recipients">${r.recipients.map(p=>esc(recipientName(p))).join(' · ')}</p>${r.workTitle?`<p class="ch-award-work">${esc(local(r.workTitle))}</p>`:''}${r.awardingBody?`<p class="ch-subtext">${esc(local(r.awardingBody))}</p>`:''}${local(r.notes)?`<p class="ch-subtext">${esc(local(r.notes))}</p>`:''}</article>`).join(''):`<p>${t('Nenhuma premiação para estes filtros.','No awards match these filters.')}</p>`}</div>`;
        root.querySelector('.ch-reset')?.addEventListener('click',()=>{year=null;render();});
      }
      function update(){
        year=null;
        const query=normalize(val('query')).trim();
        filtered=records.filter(r=>r.recipients.some(p=>(!val('recipient')||p.personId===val('recipient'))&&(!val('group')||(val('group')==='faculty'?facultyIds.has(p.personId):superviseeIds.has(p.personId))))&&(!val('category')||r.category===val('category'))&&(!query||normalize([local(r.title),local(r.workTitle),local(r.notes),local(r.awardingBody),...r.recipients.map(recipientName)].join(' ')).includes(query)));
        render();
      }
      root.querySelectorAll('select').forEach(s=>s.addEventListener('change',update));
      root.querySelector('input').addEventListener('input',update);
      root.querySelector('.ch-download').addEventListener('click',()=>download('premios.csv',[[t('Ano','Year'),t('Prêmio','Award'),t('Premiados da comunidade','Community recipients'),t('Trabalho','Work'),t('Instituição responsável','Awarding body'),t('Tipo','Type'),t('Notas','Notes'),t('Fontes','Sources')],...selectedRecords().map(r=>[r.year,local(r.title),r.recipients.map(recipientName).join('; '),local(r.workTitle),local(r.awardingBody),categories[r.category],local(r.notes),r.sources.map(s=>s.url).join('; ')])]));
      update();
    }
    const mounted=new Set();
    const views={formacao:formation,artigos:publications,instituicoes:institutions,premios:awards};
    function showPanel(id){
      if(!Object.hasOwn(views,id))return false;
      const panel=host.querySelector(`.ch-panel[id="${id}"]`);if(!panel)return false;
      host.querySelectorAll('.ch-panel').forEach(p=>{p.hidden=p!==panel;});
      host.querySelectorAll('[data-panel-link]').forEach(a=>a.setAttribute('aria-current',String(a.dataset.panelLink===id)));
      if(!mounted.has(id)){
        views[id](panel.querySelector('[data-view]'));
        mounted.add(id);
      }
      return true;
    }
    host.querySelectorAll('[data-panel-link]').forEach(a=>a.addEventListener('click',event=>{event.preventDefault();const id=a.dataset.panelLink;showPanel(id);history.replaceState(null,'','#'+id);}));
    function showFromHash(){if(!showPanel(location.hash.slice(1))){showPanel('formacao');if(location.hash)history.replaceState(null,'','#formacao');}}
    window.addEventListener('hashchange',showFromHash);
    host.querySelector('.ch-loading').hidden=true;
    showFromHash();
  }
  start().catch(error=>{console.error('Community history:',error);host.querySelector('.ch-loading').textContent=t('Não foi possível carregar os registros. Recarregue a página para tentar novamente.','The records could not be loaded. Reload the page to try again.');});
})();
