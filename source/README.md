# Combinatória Extremal no Brasil

Site Hugo em português e inglês. Os cadastros ficam em `data/` e alimentam as páginas, filtros, gráficos e exportações.

## Atualizar e conferir

Para compilar o site, instale Python 3.10 ou posterior e Hugo e deixe ambos disponíveis no terminal.

1. Edite o arquivo correspondente na tabela abaixo, preservando os IDs existentes.
2. Execute na raiz do projeto.

   ```powershell
   python scripts/update-site.py
   ```

3. Confira `output/last-update.json` e abra a prévia. O comando valida os dados, gera `public/`, verifica links e exporta a base SQLite.

No Windows, `./atualizar-site.ps1` executa a mesma atualização. Em Linux/macOS, use `sh gerar-site.sh`.

Para iniciar a prévia local, execute e abra [127.0.0.1:1319](http://127.0.0.1:1319/).

```powershell
python -m http.server 1319 --bind 127.0.0.1 --directory public
```

Recarregue o navegador depois de atualizar. `Ctrl+C` encerra o servidor de prévia. A publicação no GitHub é uma etapa separada.

## Onde editar

| Informação | Arquivo |
| --- | --- |
| Docentes, instituições, estados e homepages | `data/faculty.json` |
| Artigos e autores, na ordem da publicação | `data/publications.json` |
| BibTeX revisado, incluindo referências do MathSciNet | `data/bibliography.json` |
| Temas dos artigos, regras MSC/título e classificações revistas | `data/publication-topics.json` |
| Pessoas, titulações, orientações e pós-doutorados | `data/history.json` |
| Prêmios e respectivas fontes | `data/awards.json` |
| Eventos, datas e locais | `data/events.json` |
| Livros, cursos e materiais didáticos | `data/resources.json` |
| Textos da página inicial, contato e data do cadastro | `data/site.json` |
| Afiliações complementares dos coautores, com fontes | `scripts/collaboration-country-supplement.json` |

Um trabalho recebe uma entrada no catálogo. Quando um preprint é publicado, complete o registro existente com os dados do periódico. Identifique os autores da comunidade pelo `facultyId` para atualizar os filtros e as coautorias.

Os temas são recalculados na atualização: MSC e termos do título sugerem as áreas; `overrides` conserva as classificações revistas. Um artigo pode ter vários temas. O comando avisa se faltar classificar algum artigo. Não edite `data/publication-topic-index.json`, que é gerado automaticamente.

Datas, fontes e papéis de orientação devem acompanhar os registros. Os totais exibidos são calculados automaticamente. A data `data/site.json.updated` identifica o cadastro institucional mostrado no site.

## Arquivos e páginas

- `content/` contém os textos das páginas em PT/EN.
- `static/` contém PDFs, imagens, fontes, estilos, scripts e as páginas históricas de eventos, incluindo `static/3aEBC/index.html`.
- `layouts/` e `hugo.toml` controlam a apresentação e os menus.
- `docs/` e `scripts/README-history*.md` documentam os campos e os critérios dos dados.
- `public/` contém o site gerado. `output/` contém relatórios e `coautorias.sqlite`.

O globo lê `data/collaboration-countries.json`. Para atualizar as afiliações a partir das fontes externas e do suplemento local, execute `python scripts/update-collaboration-countries.py` e depois o comando habitual de atualização. Cada país conta um artigo uma vez. A base conserva a fonte e identifica afiliações aproveitadas de outros trabalhos.

PDFs, imagens, fontes e scripts usados pelas páginas são hospedados em `static/`. Artigos do catálogo, vídeos e páginas de pesquisadores podem apontar para as fontes externas.

Consulte o [guia dos dados](docs/dados.md) para exemplos de registros e o [guia dos painéis](scripts/README-history-panels.md) para os critérios de contagem.
