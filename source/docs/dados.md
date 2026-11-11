# Atualizar o portal de Combinatória Extremal

As informações mantidas ficam em **`data/`**. As listas, os totais, os mapas, os filtros, os gráficos e as páginas em português e inglês são reconstruídos a partir delas. Não é necessário editar cada página para acrescentar um docente, uma publicação ou uma orientação.

## Rotina de atualização

1. Edite o arquivo de dados correspondente na tabela abaixo. Preserve os IDs existentes.
2. Atualize a data `updated` do arquivo alterado quando esse campo existir. Em mudanças do cadastro atual, atualize também `data/site.json.updated`.
3. Execute, nesta pasta:

   ```powershell
   python scripts/update-site.py
   ```

   No Windows também é possível executar `./atualizar-site.ps1`. Em Linux/macOS, `sh gerar-site.sh` usa o mesmo fluxo.

4. Confira as páginas em `public/` ou recarregue o servidor de prévia que já estiver servindo essa pasta. O relatório fica em `output/last-update.json`.

O comando valida os dados, executa o Hugo e confere os arquivos gerados. **Não envia commits, não faz push e não publica na internet.** São necessários Python 3.10 ou mais recente e Hugo instalado no `PATH`; a validação usa somente a biblioteca padrão do Python.

Para conferir os dados sem compilar:

```powershell
python scripts/update-site.py --validate-only
```

Para preparar uma saída limpa para uma publicação, escolha uma pasta nova:

```powershell
python scripts/update-site.py --destination output/release-revisada --require-empty-destination
```

O destino relativo é resolvido a partir desta pasta, mesmo quando o comando é chamado de outro diretório. O comando não apaga saídas anteriores. Uma pasta nova evita incluir arquivos antigos que já não são usados. O envio ao repositório continua sendo uma etapa separada, após a revisão.

## Onde editar

| Arquivo | Informações mantidas | Atualização automática |
| --- | --- | --- |
| `data/site.json` | Data do cadastro atual, contato, textos da página inicial em PT/EN e paleta do mapa | Inicial e data do retrato institucional atual |
| `data/faculty.json` | Identidade, nome, homepage, instituição, UF, ano do doutorado, fontes e situação atual de cada docente | Diretório de Membros, filtros, mapa da inicial, retrato atual de Instituições, nomes nos dados e vértices do grafo de Membros |
| `data/history.json` | Pessoas, titulações e estágios de pós-doutorado; orientadores e fontes | Listas de Membros e painel Formação, incluindo contagens, filtros, barras e CSV |
| `data/awards.json` | Prêmios de pesquisa, livros, artigos, teses, dissertações e ingresso na ABC, com pessoas distinguidas e fontes | Painel Prêmios, filtros, contagens, lista em PT/EN e CSV |
| `data/publications.json` | Um registro por trabalho, com título, autores, ano e link | Página Artigos, filtro/busca, BibTeX básico, gráficos de artigos e arestas/pesos do grafo de Membros |
| `data/events.json` | Séries de eventos, edições, nomes, datas ISO, local confirmado e links | Lista de Eventos em PT/EN e datas apresentadas nas duas línguas |
| `data/resources.json` | Categorias e materiais didáticos, descrições PT/EN e links compartilhados | Blocos de materiais e menu lateral em PT/EN |
| `data/institution-history.json` | Retratos institucionais antigos que se deseja preservar | Histórico dos cadastros; a interface exibe o cadastro atual com a data no final |
| `data/bibliography.json` | Referências BibTeX revistas, preferencialmente do MathSciNet | Substitui o BibTeX básico dos artigos que têm referência revista; é opcional para novos artigos |

`data/history-ancestry.json` e os módulos de genealogia/coautorias temporais estão preservados como material adicional, mas não fazem parte da seção História ativa. Não é necessário atualizá-los para manter os quatro painéis atuais.

## Acrescentar ou corrigir um docente

Edite um registro em `faculty.json`. Campos principais:

```json
{
  "id": "identificador-estavel",
  "name": "Nome exibido",
  "affiliation": "SIGLA DA INSTITUIÇÃO",
  "state": "SP",
  "url": "https://homepage-do-docente.example/",
  "phdYear": 2020,
  "phdSources": ["https://fonte-institucional.example/"],
  "aliases": [],
  "active": true
}
```

O exemplo é um modelo: substitua os valores por informações confirmadas. Omitir `active` equivale a `true`. Não renomeie o ID de alguém já citado em artigos ou orientações; nomes, acentos e URLs podem ser corrigidos sem alterar o ID. Use aliases somente para grafias confirmadas da mesma pessoa.

Os dados de um docente em `history.people` são resolvidos a partir desse cadastro. Um novo docente não precisa ser duplicado ali. As demais pessoas — alunos e orientadores externos — continuam sendo cadastradas em `history.people`.

Para um docente que deixe de integrar o cadastro atual, use `active: false`, preservando seu ID, nome e informações históricas. Os vértices do grafo e o diretório atuais usam os docentes ativos. Artigos, titulações e retratos antigos continuam tendo uma identidade à qual se referir.

## Acrescentar um artigo

Em `publications.json.papers`, mantenha **uma única entrada por trabalho**. Use um ID estável como `arxiv:IDENTIFICADOR` ou `doi:DOI`, `type` igual a `arxiv` ou `journal`, `title`, `year`, `url` e a lista de `authors` na ordem da publicação. Um autor da comunidade recebe seu `facultyId`; autores externos recebem somente `name`.

```json
"authors": [
  {"name": "Nome como aparece no artigo", "facultyId": "id-do-docente"},
  {"name": "Outro autor"}
]
```

Não é necessário manter um segundo array `faculty`: ele é calculado a partir dos autores identificados. Eventuais arrays legados são ignorados na derivação. Também não se editam os anos do menu, o total de artigos, a lista de coautorias nem os pesos das arestas.

Se um trabalho do arXiv for publicado em periódico, complete **o registro existente**, mantendo a identidade do trabalho. Não acrescente uma segunda entrada apenas porque surgiu um DOI. `doi` é um campo opcional que ajuda a identificar as duas versões. O validador confere IDs, DOI e identificadores arXiv — inclusive presentes no BibTeX — e detecta títulos/autores duplicados. Títulos iguais com autores escritos de formas diferentes são sinalizados para revisão; o programa não une trabalhos por aproximação.

Se houver uma referência revista, acrescente em `bibliography.json` uma entrada cuja chave seja o ID do artigo. Sem essa entrada, o BibTeX é gerado automaticamente. Não é necessário consultar serviços externos para compilar o site, e o comando de atualização não faz buscas automáticas no arXiv ou MathSciNet.

## Consultar e atualizar a rede de coautorias

Em `/coautorias/`, cada ligação une um docente ativo a outro autor de um artigo do catálogo. O mesmo artigo pode pertencer a várias ligações. No total de um pesquisador, ele conta uma vez. As grafias equivalentes ficam em `data/collaboration-aliases.json`. O comando habitual de atualização reconstrói `data/collaboration-network.json` com os autores, os pares, suas contagens e os IDs dos artigos.

O globo usa a afiliação do coautor registrada no trabalho. Quando ela falta, o suplemento pode reaproveitar uma afiliação documentada em outro artigo ou em uma fonte institucional. Esses preenchimentos conservam a origem em `authorEvidence` e aparecem com a indicação de fonte complementar. Cada artigo conta uma vez em cada país identificado. Em `data/collaboration-countries.json`, cada registro conserva o ID do artigo, a grafia do autor, o país, as instituições identificadas e o link da fonte. O campo `countries` reúne os artigos de cada país. As correções e afiliações complementares ficam em `scripts/collaboration-country-supplement.json`. Para atualizar os metadados externos, execute `python scripts/update-collaboration-countries.py` e depois `python scripts/update-site.py`. A compilação habitual usa a base local.

Cada compilação também gera `output/coautorias.sqlite`. O arquivo inclui o catálogo completo, as assinaturas, os pares, as instituições e as fontes. A tabela `affiliation_evidence` registra se a fonte é o próprio artigo, outro trabalho ou um registro institucional, com o título, ano e data de conferência quando disponíveis. As consultas `researcher_totals`, `faculty_collaborations` e `country_counts` fornecem os totais por pesquisador, os artigos de cada ligação e os totais por país, respectivamente. Abra o arquivo em um leitor de SQLite ou use o módulo `sqlite3` do Python.

Na aba **Docentes e seus coautores**, cada perfil reúne todos os parceiros do docente nos artigos do catálogo. A aba **Pesquisadores externos** mostra as parcerias com docentes e permite expandir para todos os coautores dos mesmos trabalhos. Filtrar por docente seleciona os perfis externos, mantendo todas as conexões de cada perfil. Em SQLite, a visão `catalogue_coauthors` retorna o pesquisador, o coautor e o ID do artigo para cada ligação.

## Acrescentar uma orientação

Primeiro cadastre a pessoa em `history.people`, se ainda não existir: `id`, `name`, `aliases`, `facultyId: null` e `url: null` são suficientes. Reutilize a mesma pessoa no mestrado, doutorado ou pós-doc.

Em `history.degrees`, registre uma titulação com `id`, `personId`, `level`, `institution`, `year`, `advisors` e `sources`. Os níveis são `masters`, `professional-masters` e `phd`. Exemplo da parte de orientação:

```json
"advisors": [
  {"personId": "id-do-docente", "role": "advisor"}
],
"sources": [
  {
    "label": "Registro institucional da dissertação",
    "url": "https://repositorio-institucional.example/registro",
    "kind": "primary_institutional_source",
    "checked": "2026-11-08"
  }
]
```

Substitua os exemplos por dados e fontes reais. `displayPeriod` e `notes` são opcionais para novos registros; quando não houver período textual especial, a conclusão é apresentada a partir de `year`. Não invente datas de início. A mesma titulação tem uma entrada, mesmo que haja vários orientadores.

Preserve o papel documentado: `advisor`, `coadvisor`, `joint` ou `institutional`. **O painel Formação conta somente orientações principais**; coorientações continuam preservadas na base e na lista completa de Membros. Os papéis conjuntos explicitamente marcados com `formalRoleConfirmed: false` não entram como orientações principais. A filtragem, o total, os gráficos e o CSV seguem o mesmo critério.

Pós-docs ficam em `history.postdocs`, separados das titulações. Use `status: "current"` ou `"completed"`; `reportedYear` registra o ano informado. `startYear` e `endYear` podem ficar nulos quando desconhecidos. Um estágio em andamento não recebe ano de conclusão.

Não atualize contadores em `coverage` à mão: são metadados legados, e a versão usada pelo site deriva as contagens dos registros. A documentação detalhada dos campos está em `scripts/README-history.md`.

## Mudar uma afiliação sem perder o passado

Antes de substituir uma instituição, preserve o retrato anterior em `institution-history.json.snapshots`, se ele ainda não estiver salvo. O objeto reúne uma data, a fonte e a lista de `{facultyId, institution, state}` observada naquele momento.

Depois altere a afiliação/UF em `faculty.json` e a data do cadastro em `site.json.updated`. O retrato atual é calculado desses arquivos; os anteriores não são reescritos. A data indica quando o cadastro foi observado, não quando o vínculo empregatício começou. Mantenha os snapshots em ordem cronológica e com datas únicas.

## Acrescentar uma premiação

Em `awards.json.records`, registre `id`, `year`, `title.pt/en`, `category`, `awardingBody`, `recipients` e `sources`. As categorias são `research`, `book`, `paper`, `phd`, `masters`, `academy` e `other`; use `other` apenas para outra premiação acadêmica de pesquisa que não se enquadre nas anteriores. Não inclua olimpíadas, prêmios de iniciação científica (IC), prêmios do Encontro de Teoria da Computação (ETC), bolsas, cargos administrativos nem participação em bancas ou comissões de premiação.

Use `academy` para o ingresso na Academia Brasileira de Ciências (ABC). Identifique no título a categoria de membro (titular, associado ou afiliado), use o ano de ingresso/posse em `year` e esclareça em `notes.pt/en` o ano da eleição quando diferente. Para afiliados, registre o mandato confirmado, sem apresentar um vínculo encerrado como atual. Mudanças de categoria são distinções separadas; eleição, posse e diplomação para a mesma categoria formam um único registro. A fonte deve confirmar a condição de membro, não apenas citar a pessoa em uma notícia.

Inclua prêmios dos docentes cadastrados em `faculty.json`. Para alunos e ex-alunos, inclua somente premiações relacionadas ao trabalho ou ao período de mestrado/doutorado sob orientação ou coorientação de um docente da comunidade. Um vínculo de ex-aluno, por si só, não torna elegíveis prêmios anteriores ou posteriores de sua carreira. Prêmios por tese ou dissertação podem ser recebidos depois da defesa.

Cada pessoa premiada deve ter um `personId` de `faculty.json` ou `history.people`; o campo `name` é opcional. Para quem não é docente da comunidade, o objeto em `recipients` deve conter também `degreeId`, correspondente à sua titulação em `history.json.degrees`, e `studyConnection.pt/en`, explicando a relação da premiação com o trabalho ou período desse grau. Documente essa relação nas fontes. Em prêmios das categorias `phd` e `masters`, o nível do grau indicado deve corresponder à categoria. Esses campos são opcionais para docentes, mas são validados quando informados.

Registre uma premiação conjunta uma vez, com todas as pessoas elegíveis que a receberam no mesmo array. Todos os integrantes de `recipients` precisam atender ao critério; coautores externos podem ser mencionados em `notes.pt/en`. Quando houver, informe o trabalho em `workTitle`; identifique expressamente uma menção honrosa no título. O ano é o da premiação, que pode ser diferente do ano da defesa ou publicação.

As fontes precisam de `url`, `label` e data de conferência `checked` no formato `AAAA-MM-DD`. Prefira a entidade que concedeu o prêmio ou a instituição responsável. `awardingBody`, `workTitle` e `sources[].label` aceitam um texto único ou um objeto PT/EN; `notes`, quando presente, tem ambos os idiomas. Uma busca sem resultado não comprova ausência de premiação, e a lista não deve ser apresentada como um levantamento exaustivo.

## Acrescentar evento ou material didático

Em `events.json`, escolha uma família existente ou acrescente outra com nomes PT/EN. Para a nova edição, informe `id`, `family`, `edition` quando houver, `name.pt/en`, `start`, `end`, `city`, `state`, `venue` quando confirmado e `url.pt/en`. Em um encontro realizado em vários estados, substitua `state` por um array `states`, por exemplo `["SP", "RJ"]`. As datas de apresentação são geradas a partir de `start`/`end`; não há dois textos de data para sincronizar. Quando o evento tiver uma única página, ambos os idiomas podem apontar para ela.

As sessões do Colóquio Brasileiro de Matemática ficam na família `cbm`. Preserve o título oficial da sessão. Use as datas próprias da sessão; se a fonte confirmar somente o intervalo do colóquio, acrescente `dateScope: "parent"` para identificá-lo na página. Para encontros totalmente on-line, use `mode: "online"` e omita `city`, `state`, `states` e `venue`. Organizadores e fontes podem ser preservados em `organizers` e `sources`, sem confundir palestrantes com organizadores.

Quando uma sessão ocorrer em dias não consecutivos, informe `sessionDates` como lista de datas ISO em ordem crescente, com `start` igual à primeira e `end` à última. Assim a página apresenta os dias efetivos, sem sugerir atividade nos intervalos.

Em `resources.json`, cada material pertence a uma `category`. Mantenha `id`, `category`, `navTitle.pt/en`, `body.pt/en` e os destinos de `links`. O corpo aceita Markdown, inclusive links por referência como `[PDF][pdf]`; o destino `pdf` fica no mapa `links` uma só vez. O menu lateral acompanha automaticamente a mesma lista de itens. PDFs locais ficam em `static/`, e o link usa o caminho publicado, sem o prefixo `static/`.

## Arquivos hospedados no próprio site

PDFs de materiais didáticos ficam em `static/materiais/`; programas e outros arquivos de eventos ficam na pasta do evento em `static/`. Use URLs locais nos dados e nas páginas. As origens, datas de download e hashes dos arquivos incorporados estão em `static/materiais/sources.json`. Preserve os PDFs originais, sem alterar seu conteúdo.

As fontes tipográficas dos eventos ficam em `static/fonts/`, junto das licenças e do registro de origem. Imagens, estilos e scripts também devem ser locais. Vídeos e artigos do catálogo continuam como links externos, assim como páginas de autores, instituições, compra e fontes de informação.

## Textos editoriais e páginas de eventos

Textos livres da Turnê e detalhes de eventos continuam nos respectivos arquivos em `content/`, com um arquivo `.en.md` correspondente. As páginas históricas estáticas de eventos ficam em `static/`; não são reescritas por este fluxo. A lista central de eventos aponta para essas páginas. Criar uma nova página de evento, inserir sua programação ou atualizar formulários próprios continua sendo uma edição editorial específica — não uma alteração nos gráficos.

O cabeçalho/menu e as configurações técnicas ficam em `hugo.toml`. Aparência e comportamento ficam em `layouts/`, `assets/` e `static/css`/`static/js`. Não é necessário alterar esses arquivos para atualizar os catálogos.

## O que a validação confere

- JSON bem formado, inclusive chaves repetidas, IDs únicos e referências entre pessoas, artigos e instituições.
- Datas válidas, papéis de orientação, titulações/estágios duplicados e ciclos na orientação de doutorado.
- Identificadores bibliográficos duplicados, autores reconhecidos e referências BibTeX órfãs.
- Categorias, textos PT/EN, referências dos materiais e links das edições de eventos.
- Prêmios, pessoas premiadas conhecidas, fontes, categorias e duplicatas da mesma premiação.
- Páginas PT/EN, arquivos e âncoras locais, integridade de assets, catálogo renderizado, total do grafo, seus pares e pesos.
- Retrato institucional atual coerente com `faculty.json` e `site.json.updated`.

O verificador **não usa totais fixos** de docentes ou artigos: acrescentar um registro legítimo modifica automaticamente os resultados esperados. Ele não certifica a correção de um dado acadêmico nem a disponibilidade atual de um link externo; esses pontos dependem da fonte e da revisão editorial.

Os antigos scripts de importação/auditoria em diretórios de trabalho são registros de migrações específicas. Não execute `import-history.py` como rotina de atualização: a fonte mantida é o JSON atual. O comando geral indicado no começo é o ponto de entrada para a manutenção normal.
