#!/usr/bin/env python3
"""Materialize the coauthor directory from the site's publication and faculty records."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
import tempfile


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def build_network(data_dir):
    catalogue = read_json(data_dir / 'publications.json')['papers']
    faculty = {member['id']: member for member in read_json(data_dir / 'faculty.json')}
    active = {key for key, member in faculty.items() if member.get('active', True)}
    aliases = read_json(data_dir / 'collaboration-aliases.json')
    for raw, canonical in aliases.items():
        if not raw.strip() or not isinstance(canonical, str) or not canonical.strip() or canonical in aliases:
            raise ValueError(f'Alias inválido ou encadeado em collaboration-aliases.json: {raw!r}')

    people = {}
    variants = {}
    pairs = set()
    joint = set()
    seen = set()
    for paper in catalogue:
        paper_id = paper['id']
        if paper_id in seen:
            raise ValueError(f'ID de artigo repetido: {paper_id}')
        seen.add(paper_id)
        members = {a['facultyId'] for a in paper['authors'] if a.get('facultyId') in active}
        authors = {}
        for author in paper['authors']:
            raw = author['name']
            ident = author.get('facultyId')
            if ident:
                name = faculty[ident]['name']
            else:
                name = aliases.get(raw, raw)
                ident = 'author:' + name
            if ident in authors:
                raise ValueError(f'{paper_id}: o nome {name!r} identifica dois autores no mesmo artigo')
            authors[ident] = name
            variants.setdefault(ident, set()).add(raw)
        if not members or len(authors) < 2:
            continue
        joint.add(paper_id)
        for ident, name in authors.items():
            partners = members - {ident}
            if not partners:
                continue
            if ident not in people:
                people[ident] = {'id': ident, 'name': name, 'papers': set(), 'links': {}}
                if ident in active:
                    people[ident]['facultyId'] = ident
            person = people[ident]
            person['papers'].add(paper_id)
            for other in partners:
                person['links'].setdefault(other, set()).add(paper_id)
                pairs.add(tuple(sorted((ident, other))))

    records = []
    for ident in sorted(people):
        person = people[ident]
        person['variants'] = sorted(variants[ident])
        person['papers'] = sorted(person['papers'])
        person['links'] = {other: sorted(ids) for other, ids in sorted(person['links'].items())}
        person['paperCount'] = len(person['papers'])
        person['facultyConnectionCount'] = len(person['links'])
        records.append(person)
    return {
        'people': records,
        'papers': sorted(joint),
        'pairCount': len(pairs),
        'facultyCount': len(active),
        'catalogueCount': len(catalogue),
    }


def update(data_dir, check):
    network = build_network(data_dir)
    destination = data_dir / 'collaboration-network.json'
    text = json.dumps(network, ensure_ascii=False, indent=2) + '\n'
    if destination.exists() and destination.read_text(encoding='utf-8') == text:
        return
    if check:
        raise ValueError('collaboration-network.json está desatualizado. Execute scripts/update-collaboration-network.py.')
    temp = tempfile.NamedTemporaryFile(dir=data_dir, delete=False)
    temp_path = Path(temp.name)
    try:
        with temp:
            temp.write(text.encode('utf-8'))
        os.replace(temp_path, destination)
    finally:
        temp_path.unlink(missing_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--check', action='store_true', help='Confere a base derivada sem gravar.')
    args = parser.parse_args()
    try:
        update(args.source / 'data', args.check)
    except (OSError, ValueError, KeyError) as exc:
        sys.exit(f'ERRO: {exc}')
