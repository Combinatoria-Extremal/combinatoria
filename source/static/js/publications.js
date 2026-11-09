(() => {
  'use strict';

  document.querySelectorAll('.publication-catalogue').forEach(root => {
    const form = root.querySelector('.publication-filter');
    const selector = root.querySelector('#publication-faculty');
    const search = root.querySelector('#publication-search');
    const reset = root.querySelector('[data-action="reset-publications"]');
    const heading = root.querySelector('[data-role="list-heading"]');
    const empty = root.querySelector('.publication-empty');
    const navigation = root.querySelector('.publication-year-nav');
    const yearElements = root.querySelectorAll('[data-publication-year]');
    const exportPanel = root.querySelector('.publication-export');
    const exportCount = exportPanel.querySelector('[data-role="export-count"]');
    const copyButton = exportPanel.querySelector('[data-action="copy-bibtex"]');
    const downloadButton = exportPanel.querySelector('[data-action="download-bibtex"]');
    const exportStatus = exportPanel.querySelector('.publication-export-status');
    const exportFallback = exportPanel.querySelector('.publication-export-fallback');
    const exportText = exportFallback.querySelector('textarea');
    const english = root.dataset.lang === 'en';
    const normalize = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
    const facultyNames = new Map([...selector.options].map(option => [option.value, option.textContent]));
    const entries = [...root.querySelectorAll('.publication-entry')].map(element => {
      const faculty = new Set([...element.querySelectorAll('[data-faculty-id]')].map(author => author.dataset.facultyId));
      return {
        element,
        year: element.dataset.year,
        bibtex: element.dataset.bibtex,
        faculty,
        searchable: normalize([
          element.querySelector('strong').textContent,
          element.querySelector('em').textContent,
          ...[...faculty].map(id => facultyNames.get(id) || '')
        ].join(' ')),
        number: element.querySelector('.publication-number')
      };
    });
    let visibleEntries = [];

    const collator = new Intl.Collator(english ? 'en' : 'pt-BR', { sensitivity: 'base' });
    [...selector.options].filter(option => option.value)
      .sort((a, b) => collator.compare(a.textContent, b.textContent))
      .forEach(option => selector.append(option));

    function filter() {
      const id = selector.value;
      const terms = normalize(search.value).trim().split(/\s+/).filter(Boolean);
      const visible = entries.filter(entry => {
        const matches = (!id || entry.faculty.has(id)) && terms.every(term => entry.searchable.includes(term));
        entry.element.hidden = !matches;
        return matches;
      });
      const years = new Set(visible.map(entry => entry.year));
      visibleEntries = visible;
      visible.forEach((entry, index) => { entry.number.textContent = `${visible.length - index}.`; });
      yearElements.forEach(element => { element.hidden = !years.has(element.dataset.publicationYear); });
      heading.textContent = `${english ? 'List of papers' : 'Lista de artigos'} · ${visible.length}`;
      empty.hidden = visible.length > 0;
      navigation.hidden = visible.length === 0;
      reset.disabled = !id && !search.value;
      exportCount.textContent = english
        ? `Export ${visible.length} displayed ${visible.length === 1 ? 'paper' : 'papers'}`
        : `Exportar ${visible.length} ${visible.length === 1 ? 'artigo exibido' : 'artigos exibidos'}`;
      copyButton.disabled = downloadButton.disabled = visible.length === 0;
      exportStatus.textContent = '';
      exportFallback.hidden = true;
      exportText.value = '';
    }

    function bibliography() {
      return visibleEntries.map(entry => entry.bibtex.trim()).join('\n\n') + '\n';
    }

    copyButton.addEventListener('click', async () => {
      if (!visibleEntries.length) return;
      const text = bibliography();
      const copiedEntries = visibleEntries;
      try {
        await navigator.clipboard.writeText(text);
        if (visibleEntries !== copiedEntries) return;
        exportFallback.hidden = true;
        exportStatus.textContent = english ? 'References copied.' : 'Referências copiadas.';
      } catch {
        if (visibleEntries !== copiedEntries) return;
        exportStatus.textContent = english
          ? 'Automatic copying is unavailable in this browser.'
          : 'A cópia automática está indisponível neste navegador.';
        exportText.value = text;
        exportFallback.hidden = false;
        exportText.focus();
        exportText.select();
      }
    });

    downloadButton.addEventListener('click', () => {
      if (!visibleEntries.length) return;
      const blob = new Blob([bibliography()], { type: 'application/x-bibtex;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `combinatoria-extremal-${visibleEntries.length}-${english ? 'papers' : 'artigos'}.bib`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      exportStatus.textContent = english ? 'BibTeX file prepared.' : 'Arquivo BibTeX preparado.';
    });

    selector.addEventListener('change', filter);
    search.addEventListener('input', filter);
    form.addEventListener('submit', event => { event.preventDefault(); filter(); });
    reset.addEventListener('click', () => { selector.value = ''; search.value = ''; filter(); });
    filter();
    form.hidden = false;
    exportPanel.hidden = false;
  });
})();
