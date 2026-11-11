#!/usr/bin/env python3
"""Validate maintained JSON and, optionally, Hugo output. Python standard library only."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import date
import hashlib
import base64
from html import unescape
from html.parser import HTMLParser
from itertools import combinations
import json
from pathlib import Path
import re
import sys
import unicodedata
from urllib.parse import unquote, urljoin, urlsplit
from publication_topics import build_index

SOURCE = Path(__file__).resolve().parents[1]
STATES = set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split())
ROLES = {'advisor', 'coadvisor', 'joint', 'institutional'}
LEVELS = {'masters', 'professional-masters', 'phd'}
AWARD_CATEGORIES = {'research', 'book', 'paper', 'phd', 'masters', 'academy', 'other'}


class InvalidData(ValueError):
    pass


def need(condition, where, message):
    if not condition:
        raise InvalidData(f'{where}: {message}')


def text(value, where, empty=False):
    need(isinstance(value, str) and (empty or value.strip()), where, 'informe um texto' + ('' if empty else ' não vazio'))
    return value


def obj(value, where):
    need(isinstance(value, dict), where, 'esperado um objeto JSON { ... }')
    return value


def array(value, where):
    need(isinstance(value, list), where, 'esperada uma lista JSON [ ... ]')
    return value


def bilingual(value, where, empty=False):
    obj(value, where)
    for lang in ('pt', 'en'):
        text(value.get(lang), f'{where}.{lang}', empty)


def localizable(value, where):
    if isinstance(value, str):
        text(value, where)
    else:
        bilingual(value, where)


def iso(value, where):
    text(value, where)
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise InvalidData(f'{where}: use uma data real no formato AAAA-MM-DD') from exc
    need(parsed.isoformat() == value, where, 'use o formato AAAA-MM-DD')
    return parsed


def year(value, where, optional=False):
    if value is None and optional:
        return
    need(type(value) is int and 1000 <= value <= 3000, where, 'informe o ano como número inteiro')


def url(value, where):
    text(value, where)
    parsed = urlsplit(value)
    need(parsed.scheme in ('http', 'https', 'mailto') or value.startswith(('/', '#', './', '../')), where,
         'use URL http(s), mailto ou caminho relativo do site')
    need(not re.search(r'[\r\n\x00]', value), where, 'URL contém caracteres de controle')
    if parsed.scheme in ('http', 'https'):
        need(bool(parsed.netloc), where, 'URL sem domínio')


def unique(rows, where):
    result = {}
    for index, row in enumerate(array(rows, where)):
        key = obj(row, f'{where}[{index}]').get('id')
        text(key, f'{where}[{index}].id')
        need(key not in result, where, f'ID duplicado: {key}')
        result[key] = row
    return result


def load(path):
    def pairs(items):
        result = {}
        for key, value in items:
            need(key not in result, str(path), f'chave JSON repetida: {key}')
            result[key] = value
        return result
    try:
        return json.loads(path.read_text(encoding='utf-8-sig'), object_pairs_hook=pairs)
    except FileNotFoundError as exc:
        raise InvalidData(f'{path}: arquivo não encontrado') from exc
    except json.JSONDecodeError as exc:
        raise InvalidData(f'{path}:{exc.lineno}:{exc.colno}: JSON inválido: {exc.msg}') from exc


def norm_title(value):
    # Keep mathematical punctuation and symbols: e.g. k and -k are not the same title.
    value = unescape(re.sub(r'<[^>]+>', '', value))
    value = unicodedata.normalize('NFKC', value).casefold()
    value = value.translate(str.maketrans({'–': '-', '—': '-', '’': "'", '‘': "'"}))
    return ' '.join(value.split()).rstrip(' .')


def norm_doi(value):
    value = unquote(value.strip()).lower()
    value = re.sub(r'^(?:https?://(?:dx\.)?doi\.org/|doi\s*:\s*)', '', value)
    return value if re.match(r'^10\.\d{4,9}/\S+$', value) else None


def norm_arxiv(value):
    value = re.sub(r'^(?:arxiv\s*:\s*|https?://(?:www\.)?arxiv\.org/(?:abs|pdf)/)', '', value.strip(), flags=re.I)
    value = re.sub(r'\.pdf$', '', value, flags=re.I)
    value = re.sub(r'v\d+$', '', value, flags=re.I)
    return value.lower() if re.fullmatch(r'(?:\d{4}\.\d{4,5}|[A-Za-z.-]+/\d{7})', value) else None


def primary(advisor):
    return advisor['role'] in ('advisor', 'institutional') or (advisor['role'] == 'joint' and advisor.get('formalRoleConfirmed') is not False)


def validate_source(source):
    data = {name: load(source / 'data' / (name + '.json')) for name in
            ('site', 'faculty', 'history', 'publications', 'bibliography', 'publication-topics', 'events', 'resources', 'institution-history', 'awards')}
    warnings = []
    site = obj(data['site'], 'site.json')
    iso(site.get('updated'), 'site.json.updated')
    need(re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', text(site.get('contactEmail'), 'site.json.contactEmail')),
         'site.json.contactEmail', 'endereço de e-mail inválido')
    home = obj(site.get('home'), 'site.json.home')
    for lang in ('pt', 'en'):
        obj(home.get(lang), f'site.json.home.{lang}')
        for field in ('welcomeTitle', 'welcomeIntro', 'contactBefore', 'contactAfter', 'learningTitle', 'learningIntro', 'nextStep', 'mapAlt'):
            text(home[lang].get(field), f'site.json.home.{lang}.{field}')
        for reading in array(home[lang].get('readings'), f'site.json.home.{lang}.readings'):
            text(reading, f'site.json.home.{lang}.readings')
    for state, color in obj(site.get('mapColors', {}), 'site.json.mapColors').items():
        need(state in STATES and isinstance(color, str) and re.fullmatch(r'#[0-9a-fA-F]{6}', color), 'site.json.mapColors', 'use uma UF válida e cor hexadecimal #RRGGBB')
    if 'mapPalette' in site:
        palette = array(site['mapPalette'], 'site.json.mapPalette')
        need(palette, 'site.json.mapPalette', 'a paleta não pode ser vazia')
        need(all(isinstance(c, str) and re.fullmatch(r'#[0-9a-fA-F]{6}', c) for c in palette), 'site.json.mapPalette', 'use cores hexadecimais #RRGGBB')
    faculty = unique(data['faculty'], 'faculty.json')
    for ident, member in faculty.items():
        at = f'faculty.json[{ident}]'
        for field in ('name', 'affiliation'):
            text(member.get(field), f'{at}.{field}')
        need(member.get('state') in STATES, f'{at}.state', 'UF brasileira desconhecida')
        url(member.get('url'), f'{at}.url')
        year(member.get('phdYear'), f'{at}.phdYear')
        need(type(member.get('active', True)) is bool, f'{at}.active', 'use true ou false')
        for alias in member.get('aliases', []):
            text(alias, f'{at}.aliases')
    active = {ident for ident, member in faculty.items() if member.get('active', True)}
    history = obj(data['history'], 'history.json')
    iso(history.get('updated'), 'history.json.updated')
    people = unique(history.get('people'), 'history.json.people')
    mapped_faculty = {}
    for ident, person in people.items():
        text(person.get('name'), f'history.json.people[{ident}].name')
        faculty_id = person.get('facultyId')
        if faculty_id:
            need(faculty_id in faculty, f'history.json.people[{ident}].facultyId', f'docente desconhecido: {faculty_id}')
            need(faculty_id not in mapped_faculty, 'history.json.people', f'dois IDs representam o mesmo docente: {faculty_id}')
            mapped_faculty[faculty_id] = ident
    for ident, member in faculty.items():
        need(mapped_faculty.get(ident, ident) == ident, 'history.json.people', f'use o ID canônico {ident} para o docente')
        people[ident] = {**people.get(ident, {}), **member, 'facultyId': ident}
    academic_keys, stay_keys, links = set(), set(), defaultdict(set)
    for kind in ('degrees', 'postdocs'):
        for ident, record in unique(history.get(kind), f'history.json.{kind}').items():
            at = f'history.json.{kind}[{ident}]'
            need(record.get('personId') in people, at + '.personId', 'pessoa não cadastrada')
            text(record.get('institution'), at + '.institution')
            for field in ('notes', 'displayPeriod', 'displayRoles'):
                if field in record:
                    bilingual(record[field], at + '.' + field, empty=field != 'displayPeriod')
            advisors = array(record.get('advisors'), at + '.advisors')
            need(advisors, at + '.advisors', 'registre ao menos um vínculo de orientação ou supervisão')
            advisor_ids = set()
            for advisor in advisors:
                obj(advisor, at + '.advisors')
                need(advisor.get('personId') in people, at + '.advisors', f'orientador desconhecido: {advisor.get("personId")}')
                need(advisor['personId'] != record['personId'], at, 'pessoa não pode orientar a si própria')
                need(advisor['personId'] not in advisor_ids, at, 'orientador repetido no mesmo registro')
                advisor_ids.add(advisor['personId'])
                need(advisor.get('role') in ROLES, at + '.advisors.role', 'papel desconhecido')
                if advisor.get('label'):
                    bilingual(advisor['label'], at + '.advisors.label')
                if kind == 'degrees' and record.get('level') == 'phd':
                    links[advisor['personId']].add(record['personId'])
            for association in record.get('associations', []):
                need(association.get('personId') in people, at + '.associations', 'pessoa associada desconhecida')
            sources = array(record.get('sources'), at + '.sources')
            need(sources, at + '.sources', 'registre a fonte, inclusive quando for uma confirmação pessoal documentada')
            for evidence in sources:
                obj(evidence, at + '.sources')
                need(evidence.get('label') or evidence.get('url'), at + '.sources', 'fonte sem identificação')
                if evidence.get('url'):
                    url(evidence['url'], at + '.sources.url')
                if evidence.get('checked'):
                    iso(evidence['checked'], at + '.sources.checked')
            year(record.get('startYear'), at + '.startYear', optional=True)
            if kind == 'degrees':
                need(record.get('level') in LEVELS, at + '.level', 'tipo de titulação desconhecido')
                year(record.get('year'), at + '.year')
                need(record.get('startYear') is None or record['startYear'] <= record['year'], at, 'início posterior à conclusão')
                key = (record['personId'], record['level'], record['institution'], record['year'])
                need(key not in academic_keys, at, 'titulação já registrada para essa pessoa, nível, instituição e ano')
                academic_keys.add(key)
            else:
                need(record.get('status') in ('completed', 'current'), at + '.status', 'use completed ou current')
                year(record.get('endYear'), at + '.endYear', optional=True)
                reported = record.get('reportedYear') or record.get('endYear') or record.get('startYear')
                year(reported, at + '.reportedYear')
                need(record['status'] != 'current' or record.get('endYear') is None, at, 'estágio atual não deve ter ano de conclusão')
                need(record.get('startYear') is None or record.get('endYear') is None or record['startYear'] <= record['endYear'], at, 'período invertido')
                key = (record['personId'], record['institution'], record.get('startYear'), record.get('endYear'), reported)
                need(key not in stay_keys, at, 'estágio de pós-doutorado duplicado')
                stay_keys.add(key)
    visiting, visited = set(), set()
    def visit(ident):
        need(ident not in visiting, 'history.json.degrees', f'ciclo de orientação de doutorado envolvendo {ident}')
        if ident in visited:
            return
        visiting.add(ident)
        for child in links[ident]:
            visit(child)
        visiting.remove(ident)
        visited.add(ident)
    for ident in people:
        visit(ident)
    awards = obj(data['awards'], 'awards.json')
    iso(awards.get('updated'), 'awards.json.updated')
    award_rows = unique(awards.get('records'), 'awards.json.records')
    award_degrees = {record['id']: record for record in history['degrees']}
    award_keys = set()
    for ident, award in award_rows.items():
        at = f'awards.json.records[{ident}]'
        year(award.get('year'), at + '.year')
        bilingual(award.get('title'), at + '.title')
        need(award.get('category') in AWARD_CATEGORIES, at + '.category', 'categoria de prêmio desconhecida')
        localizable(award.get('awardingBody'), at + '.awardingBody')
        if 'notes' in award:
            bilingual(award['notes'], at + '.notes', empty=True)
        if 'workTitle' in award:
            localizable(award['workTitle'], at + '.workTitle')
        recipients = array(award.get('recipients'), at + '.recipients')
        need(recipients, at + '.recipients', 'informe ao menos uma pessoa premiada')
        recipient_ids = set()
        for recipient in recipients:
            obj(recipient, at + '.recipients')
            person_id = recipient.get('personId')
            need(person_id in people, at + '.recipients.personId', f'pessoa premiada não cadastrada: {person_id}')
            need(person_id not in recipient_ids, at + '.recipients', 'pessoa repetida no mesmo prêmio')
            recipient_ids.add(person_id)
            if 'name' in recipient:
                text(recipient['name'], at + '.recipients.name')
            recipient_at = at + f'.recipients[{person_id}]'
            is_faculty = person_id in faculty
            if not is_faculty or 'degreeId' in recipient:
                degree_id = text(recipient.get('degreeId'), recipient_at + '.degreeId')
                need(degree_id in award_degrees, recipient_at + '.degreeId', 'titulação não cadastrada em history.json.degrees')
                degree = award_degrees[degree_id]
                need(degree['personId'] == person_id, recipient_at + '.degreeId', 'a titulação deve pertencer à pessoa premiada')
                need(any(people[a['personId']].get('facultyId') in faculty for a in degree['advisors']),
                     recipient_at + '.degreeId', 'a titulação deve ter orientação ou coorientação de docente da comunidade')
                if not is_faculty and award['category'] in ('phd', 'masters'):
                    need(degree['level'] == award['category'], recipient_at + '.degreeId', 'o nível da titulação deve corresponder à categoria do prêmio')
            if not is_faculty or 'studyConnection' in recipient:
                bilingual(recipient.get('studyConnection'), recipient_at + '.studyConnection')
        sources = array(award.get('sources'), at + '.sources')
        need(sources, at + '.sources', 'registre ao menos uma fonte da premiação')
        for evidence in sources:
            obj(evidence, at + '.sources')
            url(evidence.get('url'), at + '.sources.url')
            localizable(evidence.get('label'), at + '.sources.label')
            iso(evidence.get('checked'), at + '.sources.checked')
        key = (award['year'], norm_title(award['title']['pt']), tuple(sorted(recipient_ids)),
               json.dumps(award['awardingBody'], sort_keys=True), json.dumps(award.get('workTitle'), sort_keys=True))
        need(key not in award_keys, at, 'mesma premiação e pessoas já registradas')
        award_keys.add(key)
    publications = obj(data['publications'], 'publications.json')
    iso(publications.get('updated'), 'publications.json.updated')
    papers = unique(publications.get('papers'), 'publications.json.papers')
    bibliography = obj(data['bibliography'], 'bibliography.json')
    for ident, reference in bibliography.items():
        obj(reference, f'bibliography.json[{ident}]')
        need(ident in papers, f'bibliography.json[{ident}]', 'referência sem artigo correspondente no catálogo')
        text(reference.get('canonicalBibtex') or reference.get('bibtex'), f'bibliography.json[{ident}].bibtex')
    identifiers, titles = {}, {}
    for ident, paper in papers.items():
        at = f'publications.json.papers[{ident}]'
        title = text(paper.get('title'), at + '.title')
        need(paper.get('type') in ('arxiv', 'journal'), at + '.type', 'use arxiv ou journal')
        url(paper.get('url'), at + '.url')
        year(paper.get('year'), at + '.year')
        authors = array(paper.get('authors'), at + '.authors')
        need(authors, at + '.authors', 'informe os autores na ordem da publicação')
        marked = set()
        for author in authors:
            obj(author, at + '.authors')
            text(author.get('name'), at + '.authors.name')
            if author.get('facultyId'):
                need(author['facultyId'] in faculty, at + '.authors.facultyId', f'docente desconhecido: {author["facultyId"]}')
                need(author['facultyId'] not in marked, at, 'mesmo docente marcado em dois autores')
                marked.add(author['facultyId'])
        need(marked, at, 'nenhum autor identificado como docente da comunidade por facultyId')
        # Discover the same work even when it has both an arXiv and a journal ID.
        candidates = [ident, paper['url'], paper.get('doi', ''), paper.get('arxivId', ''), paper.get('arxiv', '')]
        bib = bibliography.get(ident, {}).get('canonicalBibtex') or bibliography.get(ident, {}).get('bibtex', '')
        candidates += re.findall(r'(?im)^\s*(?:doi|eprint)\s*=\s*[{"]([^}\"]+)', bib)
        for raw in candidates:
            if not isinstance(raw, str) or not raw:
                continue
            for namespace, normalizer in (('doi', norm_doi), ('arxiv', norm_arxiv)):
                normalized = normalizer(raw)
                if normalized:
                    key = namespace + ':' + normalized
                    need(key not in identifiers or identifiers[key] == ident, at, f'mesmo trabalho também aparece em {identifiers.get(key)} ({key})')
                    identifiers[key] = ident
        key = norm_title(title)
        author_names = tuple(sorted(norm_title(a['name']) for a in authors))
        if key in titles:
            old_id, old_authors = titles[key]
            need(author_names != old_authors, at, f'título e autores duplicam {old_id}')
            warnings.append(f'{at}: título igual ao de {old_id}; confira se são versões do mesmo trabalho (autores escritos de modo diferente).')
        else:
            titles[key] = (ident, author_names)
    try:
        data['_publication_topics'] = build_index(data['publication-topics'], publications, bibliography)
    except ValueError as exc:
        raise InvalidData(str(exc)) from exc
    events = obj(data['events'], 'events.json')
    families = unique(events.get('families'), 'events.json.families')
    for ident, family in families.items():
        bilingual(family.get('name'), f'events.json.families[{ident}].name')
    event_rows = unique(events.get('events'), 'events.json.events')
    for ident, event in event_rows.items():
        at = f'events.json.events[{ident}]'
        need(event.get('family') in families, at + '.family', 'família de evento desconhecida')
        need(iso(event.get('start'), at + '.start') <= iso(event.get('end'), at + '.end'), at, 'datas do evento invertidas')
        bilingual(event.get('name'), at + '.name')
        bilingual(event.get('url'), at + '.url')
        for lang in ('pt', 'en'):
            url(event['url'][lang], at + '.url.' + lang)
        need(event.get('mode', 'in-person') in ('in-person', 'online'), at + '.mode', 'modalidade desconhecida')
        need(event.get('dateScope', 'event') in ('event', 'parent'), at + '.dateScope', 'escopo de datas desconhecido')
        if 'sessionDates' in event:
            dates = array(event['sessionDates'], at + '.sessionDates')
            need(len(dates) >= 2, at + '.sessionDates', 'informe pelo menos duas datas; para um único dia use start e end iguais')
            for value in dates:
                iso(value, at + '.sessionDates')
            need(dates == sorted(set(dates)), at + '.sessionDates', 'datas devem ser únicas e estar em ordem crescente')
            need(dates[0] == event['start'] and dates[-1] == event['end'], at + '.sessionDates', 'start e end devem corresponder ao primeiro e último dia')
            need(event.get('dateScope', 'event') == 'event', at + '.sessionDates', 'datas individuais devem ser da sessão, não do colóquio')
        if event.get('mode') == 'online':
            need(not any(event.get(key) for key in ('venue', 'city', 'state', 'states')), at, 'evento on-line não deve informar local físico')
            continue
        text(event.get('city'), at + '.city')
        if 'states' in event:
            states = array(event['states'], at + '.states')
            need(states and all(isinstance(state, str) and state in STATES for state in states), at + '.states', 'informe uma lista não vazia de UFs válidas')
            need(len(states) == len(set(states)), at + '.states', 'UF repetida')
            need(not event.get('state'), at, 'use state ou states, sem duplicar a informação')
        else:
            need(event.get('state') in STATES, at + '.state', 'UF desconhecida')
    resources = obj(data['resources'], 'resources.json')
    categories = unique(resources.get('categories'), 'resources.json.categories')
    for ident, category in categories.items():
        bilingual(category.get('title'), f'resources.json.categories[{ident}].title')
    resources_rows = unique(resources.get('items'), 'resources.json.items')
    for ident, item in resources_rows.items():
        at = f'resources.json.items[{ident}]'
        need(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]*', ident), at + '.id', 'ID deve servir como âncora HTML estável')
        need(item.get('category') in categories, at + '.category', 'categoria desconhecida')
        bilingual(item.get('navTitle'), at + '.navTitle')
        bilingual(item.get('body'), at + '.body')
        links_map = obj(item.get('links', {}), at + '.links')
        for label, target in links_map.items():
            url(target, at + '.links.' + label)
        for lang in ('pt', 'en'):
            for reference in re.findall(r'\]\[([^\]]+)\]', item['body'][lang]):
                need(reference in links_map, at + '.body.' + lang, f'link de referência sem destino em links: {reference}')
    institutions = obj(data['institution-history'], 'institution-history.json')
    dates = []
    for snapshot in array(institutions.get('snapshots'), 'institution-history.json.snapshots'):
        at = f'institution-history.json.snapshots[{snapshot.get("date")}]'
        dates.append(iso(snapshot.get('date'), at + '.date'))
        members = array(snapshot.get('members'), at + '.members')
        seen = set()
        for member in members:
            ident = member.get('facultyId')
            need(ident in faculty, at, f'docente histórico sem cadastro preservado: {ident}')
            need(ident not in seen, at, f'docente repetido: {ident}')
            seen.add(ident)
            text(member.get('institution'), at + '.institution')
            need(member.get('state') in STATES, at + '.state', 'UF desconhecida')
    need(dates == sorted(set(dates)), 'institution-history.json.snapshots', 'retratos devem ter datas únicas em ordem crescente')
    need(not dates or dates[-1] <= date.fromisoformat(site['updated']), 'site.json.updated', 'data atual do cadastro anterior ao último retrato institucional preservado')
    expected = defaultdict(set)
    for ident, paper in papers.items():
        ids = sorted({a['facultyId'] for a in paper['authors'] if a.get('facultyId') in active})
        for pair in combinations(ids, 2):
            expected[pair].add(ident)
    data['_expected_pairs'] = expected
    data['_active'] = active
    data['_faculty_all'] = faculty
    data['_people_resolved'] = people
    data['_warnings'] = warnings
    data['_counts'] = {'faculty': len(active), 'facultyAll': len(faculty), 'papers': len(papers),
                       'degrees': len(history['degrees']), 'postdocs': len(history['postdocs']),
                       'primaryDegrees': sum(any(primary(a) and people[a['personId']].get('facultyId') in faculty for a in r['advisors']) for r in history['degrees']),
                       'events': len(event_rows), 'resources': len(resources_rows), 'awards': len(award_rows), 'collaborationPairs': len(expected),
                       'sharedPapers': len(set().union(*expected.values())) if expected else 0}
    return data


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.ids, self.links, self.publications, self.bibtex, self.source, self.panels = [], [], [], [], None, []
        self.publication_topics = {}
        self.feed(path.read_text(encoding='utf-8'))

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a:
            self.ids.append(a['id'])
        for attr in {'a': ['href'], 'img': ['src'], 'script': ['src'], 'link': ['href'], 'iframe': ['src'], 'source': ['src']}.get(tag, []):
            if a.get(attr):
                self.links.append((a[attr], a.get('integrity')))
        if 'data-publication-id' in a:
            self.publications.append(a['data-publication-id'])
            self.bibtex.append(a.get('data-bibtex'))
            self.publication_topics[a['data-publication-id']] = a.get('data-topics', '').split()
        if 'community-history' in a.get('class', '').split():
            self.source = a.get('data-source')
        if 'ch-panel' in a.get('class', '').split():
            self.panels.append(a.get('id'))


def validate_output(source, output, data):
    output = output.resolve()
    pages = {p.resolve(): Page(p) for p in output.rglob('*.html')}
    need(pages, str(output), 'nenhuma página HTML gerada')
    canonical = 'https://extremal.combinatoria.org/'
    checks = 0
    for path, page in pages.items():
        relative = path.relative_to(output).as_posix()
        pageurl = urljoin(canonical, relative[:-10] if relative.endswith('index.html') else relative)
        duplicates = [ident for ident, n in Counter(page.ids).items() if n > 1]
        need(not duplicates, relative, f'IDs HTML duplicados: {duplicates}')
        for target, integrity in page.links:
            parsed = urlsplit(urljoin(pageurl, target))
            if parsed.scheme not in ('http', 'https') or parsed.netloc != urlsplit(canonical).netloc:
                continue
            local = (output / unquote(parsed.path).lstrip('/')).resolve()
            need(local.is_relative_to(output), relative, f'link sai da pasta gerada: {target}')
            if local.is_dir():
                local /= 'index.html'
            need(local.is_file(), relative, f'link/arquivo local ausente: {target}')
            checks += 1
            if parsed.fragment and local in pages:
                need(unquote(parsed.fragment) in pages[local].ids, relative, f'âncora não encontrada: {target}')
            if integrity:
                for token in integrity.split():
                    algorithm, sep, expected = token.partition('-')
                    if sep and algorithm in ('sha256', 'sha384', 'sha512'):
                        actual = base64.b64encode(hashlib.new(algorithm, local.read_bytes()).digest()).decode()
                        need(actual == expected, relative, f'integridade incorreta: {target}')
    paper_ids = {p['id'] for p in data['publications']['papers']}
    for prefix in ('', 'en/'):
        for name in ('membros', 'artigos', 'historia', 'eventos', 'material-didatico'):
            need((output / prefix / name / 'index.html') in pages, prefix + name, 'página não foi gerada')
        articles = pages[output / prefix / 'artigos/index.html']
        need(set(articles.publications) == paper_ids and len(articles.publications) == len(paper_ids), prefix + 'artigos', 'catálogo renderizado não corresponde aos IDs da fonte')
        need(all(articles.bibtex), prefix + 'artigos', 'artigo sem referência BibTeX gerada')
        need('publication-topic' in articles.ids, prefix + 'artigos', 'filtro por tema ausente')
        need(articles.publication_topics == {ident: row['topics'] for ident, row in data['_publication_topics']['papers'].items()},
             prefix + 'artigos', 'temas renderizados não correspondem às classificações da fonte')
        history = pages[output / prefix / 'historia/index.html']
        need(history.panels == ['formacao', 'artigos', 'instituicoes', 'premios'], prefix + 'historia', 'painéis inesperados')
        need(history.source, prefix + 'historia', 'bundle de dados ausente')
        bundle = load(output / history.source.lstrip('/'))
        need({p['id'] for p in bundle['publications']['papers']} == paper_ids, prefix + 'historia', 'gráfico de artigos usa catálogo diferente')
        need({p['id'] for p in bundle['faculty']} == data['_active'], prefix + 'historia', 'cadastro de docentes ativos inconsistente')
        need(bundle.get('awards') == data['awards'], prefix + 'historia', 'painel de prêmios usa registros diferentes da fonte')
        current = bundle['institutions']['snapshots'][-1]
        expected_current = {(f['id'], f['affiliation'], f['state']) for f in data['faculty'] if f.get('active', True)}
        need(current['date'] == data['site']['updated'], prefix + 'historia', 'data do retrato atual não acompanha site.json.updated')
        need({(m['facultyId'], m['institution'], m['state']) for m in current['members']} == expected_current, prefix + 'historia', 'retrato atual não acompanha faculty.json')
    graph = load(output / 'data/coauthorship.json')
    need({n['id'] for n in graph['nodes']} == data['_active'], 'coauthorship.json', 'vértices não correspondem aos docentes ativos')
    got = {}
    for edge in graph['edges'] or []:
        pair = tuple(sorted((edge['source'], edge['target'])))
        need(pair not in got, 'coauthorship.json', 'par duplicado')
        got[pair] = set(edge['papers'])
        need(len(got[pair]) == len(edge['papers']) == edge['weight'], 'coauthorship.json', 'peso incorreto ou artigo repetido')
    need(got == dict(data['_expected_pairs']), 'coauthorship.json', 'arestas não correspondem ao catálogo e aos autores ativos')
    need(graph['catalogueCount'] == len(paper_ids), 'coauthorship.json', 'total desatualizado')
    return {'htmlPages': len(pages), 'localLinksAndAssets': checks, 'languages': ['pt', 'en'], 'catalogueAndGraph': 'ok'}


def main():
    parser = argparse.ArgumentParser(description='Valida os arquivos centrais e opcionalmente a saída do Hugo, sem acessar a internet.')
    parser.add_argument('--source', type=Path, default=SOURCE)
    parser.add_argument('--output', type=Path, help='Pasta já compilada; valida páginas, links, totais e grafo.')
    args = parser.parse_args()
    try:
        source = args.source.resolve()
        data = validate_source(source)
        report = {'status': 'ok', 'counts': data['_counts'], 'warnings': data['_warnings']}
        if args.output:
            report['output'] = validate_output(source, args.output, data)
        print(json.dumps(report, ensure_ascii=False, indent=2))
    except (InvalidData, OSError) as exc:
        print(f'ERRO: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
