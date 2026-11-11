#!/usr/bin/env python3
"""Derive the catalogue's topic index from reviewed assignments, MSC and titles."""
from __future__ import annotations

import json
from pathlib import Path
import re
import unicodedata


def normalize(value):
    value = unicodedata.normalize('NFKD', value).casefold()
    return ''.join(c for c in value if not unicodedata.combining(c)).translate(
        str.maketrans({'–': '-', '—': '-', '’': "'"}))


def build_index(config, publications, bibliography):
    """Return a deterministic index. Never change the bibliography or infer from authors."""
    def require(condition, message):
        if not condition:
            raise ValueError('publication-topics.json: ' + message)

    require(isinstance(config, dict), 'esperado um objeto JSON')
    topics = config.get('topics')
    require(isinstance(topics, list) and topics, 'informe a lista de temas')
    ids, rules = [], {}
    for topic in topics:
        require(isinstance(topic, dict), 'cada tema deve ser um objeto')
        ident = topic.get('id')
        require(isinstance(ident, str) and re.fullmatch(r'[a-z][a-z0-9-]*', ident), 'ID de tema inválido')
        require(ident not in ids, 'ID de tema repetido: ' + ident)
        ids.append(ident)
        names = topic.get('name')
        require(isinstance(names, dict) and all(isinstance(names.get(lang), str) and names[lang].strip()
                                               for lang in ('pt', 'en')), ident + ': informe os nomes em pt e en')
        prefixes = topic.get('mscPrefixes', [])
        patterns = topic.get('titlePatterns', [])
        require(isinstance(prefixes, list) and all(isinstance(p, str) and re.fullmatch(r'\d{2}(?:[A-Z](?:\d{2})?|-\d{2})?', p)
                                                  for p in prefixes), ident + ': prefixos MSC inválidos')
        require(isinstance(patterns, list) and all(isinstance(p, str) and p.strip() for p in patterns),
                ident + ': titlePatterns deve ser uma lista de expressões regulares')
        try:
            compiled = [re.compile(pattern) for pattern in patterns]
        except re.error as exc:
            raise ValueError(f'publication-topics.json: {ident}: expressão inválida: {exc}') from exc
        rules[ident] = (tuple(prefixes), compiled)

    papers = publications['papers']
    paper_ids = {p['id'] for p in papers}
    overrides = config.get('overrides', {})
    require(isinstance(overrides, dict), 'overrides deve ser um objeto indexado pelo ID do artigo')
    for ident, assigned in overrides.items():
        require(ident in paper_ids, 'override sem artigo no catálogo: ' + ident)
        require(isinstance(assigned, list) and assigned and all(t in ids for t in assigned),
                ident + ': informe pelo menos um ID de tema conhecido')
        require(len(set(assigned)) == len(assigned), ident + ': tema repetido')

    index, counts, unclassified = {}, dict.fromkeys(ids, 0), []
    for paper in papers:
        ident = paper['id']
        reference = bibliography.get(ident, {})
        bibtex = reference.get('canonicalBibtex') or reference.get('bibtex', '')
        # MRCLASS contains primary and secondary MSC codes, with varying whitespace.
        field = re.search(r'\bMRCLASS\s*=\s*[{\"]([^}\"]+)', bibtex, flags=re.I)
        codes = list(dict.fromkeys(re.findall(r'\b\d{2}(?:[A-Z]\d{2}|-\d{2})\b', field[1]))) if field else []
        title = normalize(paper['title'])
        assigned, from_msc, from_title = [], False, False
        if ident in overrides:
            assigned = [t for t in ids if t in overrides[ident]]
            method = 'reviewed'
        else:
            for topic in ids:
                prefixes, patterns = rules[topic]
                msc_match = bool(prefixes) and any(code.startswith(prefixes) for code in codes)
                title_match = any(pattern.search(title) for pattern in patterns)
                if msc_match or title_match:
                    assigned.append(topic)
                    from_msc |= msc_match
                    from_title |= title_match
            method = '+'.join(name for name, matched in [('msc', from_msc), ('title', from_title)] if matched)
        if not assigned:
            unclassified.append(f"{ident} — {paper['title']}")
        for topic in assigned:
            counts[topic] += 1
        index[ident] = {'topics': assigned, 'msc': codes, 'method': method}
    require(not unclassified, 'artigos sem tema; classifique em overrides ou ajuste as regras:\n' + '\n'.join(unclassified))
    return {'papers': index, 'counts': counts}


def save_index(source, index, check=False):
    """The JSON is generated; use --validate-only to detect stale copies."""
    path = Path(source) / 'data/publication-topic-index.json'
    content = json.dumps(index, ensure_ascii=False, indent=2) + '\n'
    if check:
        if not path.is_file() or path.read_text(encoding='utf-8-sig') != content:
            raise ValueError('Índice de temas desatualizado. Execute python scripts/update-site.py.')
    else:
        path.write_text(content, encoding='utf-8')
