#!/usr/bin/env python3
"""One local update command. Never publishes, changes Git or queries external APIs."""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from publication_topics import save_index

SOURCE = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description='Valida os dados, compila o site e confere páginas/gráficos. Não publica.')
    parser.add_argument('--source', type=Path, default=SOURCE, help='Fonte Hugo; por padrão, a pasta que contém este script.')
    parser.add_argument('--destination', type=Path, default=Path('public'), help='Saída local; caminho relativo à fonte Hugo (padrão: public).')
    parser.add_argument('--validate-only', action='store_true', help='Valida somente os arquivos editáveis, sem compilar.')
    parser.add_argument('--require-empty-destination', action='store_true', help='Exige saída vazia, recomendado para preparar uma publicação.')
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('site_validation', Path(__file__).with_name('validate-site-data.py'))
    validation = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(validation)
    source = args.source.resolve()
    destination = (args.destination if args.destination.is_absolute() else source / args.destination).resolve()
    try:
        validation.need(source.is_dir(), str(source), 'pasta fonte não encontrada')
        validation.need(destination != source and not source.is_relative_to(destination), str(destination), 'a saída não pode substituir a fonte ou uma pasta que a contém')
        for protected in ('content', 'data', 'static', 'assets', 'layouts', 'themes', 'scripts', 'i18n', 'archetypes', '.git'):
            validation.need(not destination.is_relative_to(source / protected), str(destination), f'a saída não pode ficar dentro de {protected}/')
        print('1/3  Validando os arquivos centrais...', flush=True)
        data = validation.validate_source(source)
        save_index(source, data['_publication_topics'], check=args.validate_only)
        for warning in data['_warnings']:
            print('REVISAR: ' + warning, flush=True)
        report = {'status': 'ok', 'source': str(source), 'counts': data['_counts'], 'warnings': data['_warnings'], 'published': False}
        if args.require_empty_destination and not args.validate_only:
            validation.need(not destination.exists() or (destination.is_dir() and not any(destination.iterdir())), str(destination), 'a saída já contém arquivos; escolha uma pasta nova para a versão de publicação')
        network_command = [sys.executable, str(Path(__file__).with_name('update-collaboration-network.py')), '--source', str(source)]
        if args.validate_only:
            subprocess.run([*network_command, '--check'], check=True)
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 0
        subprocess.run(network_command, check=True)
        hugo = shutil.which('hugo')
        validation.need(hugo is not None, 'Hugo', 'executável não encontrado no PATH; instale Hugo e abra um novo terminal')
        print('2/3  Compilando as duas línguas e recalculando os dados derivados...', flush=True)
        subprocess.run([hugo, '--source', str(source), '--destination', str(destination), '--environment', 'production', '--minify'],
                       cwd=source, env={**os.environ, 'PYTHONUTF8': '1'}, check=True)
        print('3/3  Conferindo páginas, links, catálogos e grafo gerados...', flush=True)
        report['output'] = validation.validate_output(source, destination, data)
        subprocess.run([sys.executable, str(Path(__file__).with_name('export-collaboration-db.py')),
                        '--source', str(source)], check=True)
        report['destination'] = str(destination)
        report_file = source / 'output' / 'last-update.json'
        report_file.parent.mkdir(parents=True, exist_ok=True)
        report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(report, ensure_ascii=False, indent=2))
        print(f'Atualização local concluída. Relatório: {report_file}')
        print('Nenhum arquivo foi enviado ao Git ou publicado na internet.')
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        print(f'ERRO: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
