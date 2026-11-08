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
    const english = root.dataset.lang === 'en';
    const normalize = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
    const facultyNames = new Map([...selector.options].map(option => [option.value, option.textContent]));
    const entries = [...root.querySelectorAll('.publication-entry')].map(element => {
      const faculty = new Set([...element.querySelectorAll('[data-faculty-id]')].map(author => author.dataset.facultyId));
      return {
        element,
        year: element.dataset.year,
        faculty,
        searchable: normalize([
          element.querySelector('strong').textContent,
          element.querySelector('em').textContent,
          ...[...faculty].map(id => facultyNames.get(id) || '')
        ].join(' ')),
        number: element.querySelector('.publication-number')
      };
    });

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
      visible.forEach((entry, index) => { entry.number.textContent = `${visible.length - index}.`; });
      yearElements.forEach(element => { element.hidden = !years.has(element.dataset.publicationYear); });
      heading.textContent = `${english ? 'List of papers' : 'Lista de artigos'} · ${visible.length}`;
      empty.hidden = visible.length > 0;
      navigation.hidden = visible.length === 0;
      reset.disabled = !id && !search.value;
    }

    selector.addEventListener('change', filter);
    search.addEventListener('input', filter);
    form.addEventListener('submit', event => { event.preventDefault(); filter(); });
    reset.addEventListener('click', () => { selector.value = ''; search.value = ''; filter(); });
    filter();
    form.hidden = false;
  });
})();
