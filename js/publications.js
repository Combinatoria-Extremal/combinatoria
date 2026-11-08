(() => {
  'use strict';

  document.querySelectorAll('.publication-catalogue').forEach(root => {
    const selector = root.querySelector('#publication-faculty');
    const reset = root.querySelector('[data-action="reset-publications"]');
    const heading = root.querySelector('[data-role="list-heading"]');
    const empty = root.querySelector('.publication-empty');
    const navigation = root.querySelector('.publication-year-nav');
    const yearElements = root.querySelectorAll('[data-publication-year]');
    const english = root.dataset.lang === 'en';
    const entries = [...root.querySelectorAll('.publication-entry')].map(element => ({
      element,
      year: element.dataset.year,
      faculty: new Set([...element.querySelectorAll('[data-faculty-id]')].map(author => author.dataset.facultyId)),
      number: element.querySelector('.publication-number')
    }));

    const collator = new Intl.Collator(english ? 'en' : 'pt-BR', { sensitivity: 'base' });
    [...selector.options].filter(option => option.value)
      .sort((a, b) => collator.compare(a.textContent, b.textContent))
      .forEach(option => selector.append(option));

    function filter() {
      const id = selector.value;
      const visible = entries.filter(entry => !id || entry.faculty.has(id));
      const years = new Set(visible.map(entry => entry.year));
      entries.forEach(entry => { entry.element.hidden = Boolean(id && !entry.faculty.has(id)); });
      visible.forEach((entry, index) => { entry.number.textContent = `${visible.length - index}.`; });
      yearElements.forEach(element => { element.hidden = !years.has(element.dataset.publicationYear); });
      heading.textContent = `${english ? 'List of papers' : 'Lista de artigos'} · ${visible.length}`;
      empty.hidden = visible.length > 0;
      navigation.hidden = visible.length === 0;
      reset.disabled = !id;
    }

    selector.addEventListener('change', filter);
    reset.addEventListener('click', () => { selector.value = ''; filter(); });
    filter();
    root.querySelector('.publication-filter').hidden = false;
  });
})();
