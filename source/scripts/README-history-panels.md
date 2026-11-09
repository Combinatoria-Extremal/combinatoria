# Painéis de História: manutenção e validação

Esta documentação complementa [README-history.md](README-history.md), que descreve pessoas, titulações, pós-doutorados e a migração das listas de Membros. A seção História contém somente **Formação, Artigos e Instituições**, em português e inglês, com Formação como painel inicial. Os painéis são gerados localmente pelo Hugo e executados no navegador sem CDN, banco de dados, rastreamento ou consultas externas.

## Arquivos e responsabilidades

| Fonte mantida | Uso |
| --- | --- |
| `data/history.json` | Pessoas, aliases, titulações e pós-doc; painel Formação e listas de Membros. |
| `data/faculty.json` | IDs e nomes dos docentes atualmente catalogados, afiliação atual e ano do doutorado. |
| `data/publications.json` | Catálogo de artigos; painel Artigos, página Artigos e grafo de Membros. |
| `data/events.json` | Fonte única da página Eventos, em PT/EN; não integra a seção História. |
| `data/institution-history.json` | Retratos institucionais datados; não reconstrói empregos anteriores. |
| `data/history-ancestry.json` | Dados adicionais de formação dos docentes, preservados fora da interface e do bundle de História; não entram nas contagens de Formação. |

`content/historia.md` e `content/historia.en.md` usam `layouts/shortcodes/community-history.html`. Esse shortcode reúne as fontes dos três painéis em um JSON com fingerprint e inclui `community-history.css` e `community-history.js`. O JS coordena navegação e filtros. O item de menu usa `/historia/`; a navegação Hugo localiza a rota inglesa como `/en/historia/`.

Os módulos `history-genealogy.js` e `history-collaborations.js`, seus CSS e testes foram preservados como código independente, mas não são carregados pela seção História. O grafo existente na página Membros continua separado desses módulos.

Não edite `public/`, os bundles JSON gerados nem os fingerprints. Recompile a fonte depois de uma alteração. Uma atualização das fontes alimenta ambas as línguas.

## Eventos, fora da seção História

Mantenha `families` e `events` em `data/events.json`. Cada evento tem ID estável, família, edição, datas ISO `start`/`end`, cidade, UF, local confirmado ou string vazia, nomes/datas/URLs em `pt` e `en`, além de fontes. O shortcode `event-list` usa a ordem das famílias e, dentro de cada família, a ordem dos registros; preserve a ordenação desejada ao acrescentar uma edição.

As datas ISO preservam a cronologia dos registros; os textos em `dates.pt`/`dates.en` servem à apresentação. Atualize ambos em conjunto. Não preencha um local ainda não confirmado. Reutilize o mesmo destino PT/EN quando o evento só tem uma versão; use a rota inglesa quando ela existe. A conversão inicial preservou sete eventos, seus textos, datas e destinos de links. A remoção do painel Eventos de História não remove essa página nem sua fonte de dados.

## Retratos institucionais

Em `institution-history.json`, acrescente um novo objeto a `snapshots` com data ISO, fonte PT/EN e a lista observada de `{facultyId, institution, state}`. Mantenha as datas em ordem crescente: a interface usa o último retrato como inicial. Cada docente deve aparecer uma vez no retrato, e os IDs precisam resolver no cadastro de docentes. Preserve os retratos anteriores; uma mudança de instituição não reescreve a situação histórica.

O retrato inicial é de 08/11/2026, com 19 docentes, 11 instituições e sete estados. Um retrato não informa quando um emprego começou. `affiliationPeriods` permanece vazio enquanto não houver períodos documentados; acrescentar registros a esse campo exige validar também o suporte da interface. Não inferir início de vínculo a partir de ano de doutorado, artigo ou orientação.

## Formação: somente orientações principais

O painel Formação aplica um recorte de apresentação à base completa. `isPrimary` mantém os papéis `advisor` e `institutional`, além de `joint` quando `formalRoleConfirmed` não é `false`. Não inclui `coadvisor` nem a participação conjunta cujo papel formal não foi confirmado. Os dados originais e as listas de Membros permanecem preservados.

Uma titulação entra no painel apenas se pelo menos um dos orientadores principais for docente do cadastro da comunidade, identificado por `people[].facultyId`. A existência de um orientador externo não basta para manter uma titulação na qual o único vínculo com a comunidade é de coorientação. Cada titulação elegível continua sendo contada uma única vez.

No recorte de 08/11/2026, **129 titulações** são exibidas: 92 mestrados acadêmicos, cinco mestrados profissionais e 32 doutorados. A base original continua com **140 titulações**; onze registros entram no catálogo por coorientação de membros e ficam fora deste painel. O indicador superior, as séries anuais/acumuladas, os filtros e a lista usam a mesma seleção.

Os nomes e rótulos de orientação são reconstruídos por `advisorText` a partir dos vínculos principais, sem reaproveitar `displayRoles`, que preserva o texto completo do catálogo. O filtro por docente também consulta somente esses vínculos. Mathias Schacht permanece com os dois orientadores nomeados na fonte; os registros de Daniel Morgato Martin e Renato Carmo permanecem sob Yoshiharu, sem exibir as participações adicionais de papel formal não confirmado nem suas notas de orientação conjunta.

Os pós-doutorados são tratados separadamente: os **38 registros** atuais têm orientação ou supervisão principal/institucional e permanecem disponíveis, sendo 34 concluídos e quatro em andamento. Teeradej mantém Nicolau como orientador institucional; sua associação registrada com Rob não é convertida em orientação, nem faz o registro aparecer no filtro de Rob.

A exportação CSV usa o mesmo recorte de tipo, docente, instituição e ano da lista visível. A coluna de orientação usa `advisorText`, sem coorientadores; situação, período informado e ressalva continuam preservados. Não altere a fonte bruta para ajustar somente a abrangência desse painel.

## Artigos

Mantenha IDs estáveis em `publications.papers`. Autores ficam na ordem da referência, e `authors[].facultyId` identifica os integrantes do grupo; `faculty` deve corresponder a esses mesmos IDs, sem duplicação. Nunca una pessoas só porque os nomes parecem semelhantes. A manutenção bibliográfica e a resolução de versões continuam no catálogo existente.

O filtro temporal usa `paper.year`: para um registro arXiv ele pode ser o ano do preprint; para um registro de periódico, o ano da publicação. Não misture essa medida com ano de submissão, aceite, início da pesquisa ou ingresso na comunidade. Os gráficos descrevem itens do catálogo, cuja cobertura não é um censo completo da produção.

O painel Artigos conta cada `paper.id` uma vez, mesmo quando há vários autores da comunidade. O seletor restringe a lista a um docente; a contagem pode ser anual ou acumulada. Selecionar uma barra revela os registros correspondentes. A exportação CSV conserva título, autores, ano e URL.

## Código e dados adicionais preservados

### Coautorias temporais

O componente desativado `CommunityCollaborations.buildGraph(data, firstYear, lastYear)` conta cada `paper.id` no máximo uma vez por par não ordenado de docentes. Um artigo com três docentes gera três pares, mas continua sendo um único artigo no total. Só entram pares de docentes atualmente catalogados. `CommunityCollaborations.mount(container, {faculty, papers}, lang)` retorna `getState()`, `reset()` e `destroy()`. Seu JS/CSS é independente do grafo de Membros; não há chamada a esse componente nos três painéis ativos.

### Formação adicional dos docentes

A camada `history-ancestry.json` contém `updated`, `people` e `degrees`. Ela preserva seis pessoas e dez titulações adicionais com `scope: "faculty-education"`. Pessoas e titulações seguem os campos correspondentes de `history.json`; os IDs dos docentes continuam sendo os existentes. Essa camada não integra o JSON de História nem altera Formação, os indicadores gerais ou as listas de Membros.

Reutilize IDs de pessoas já existentes e acrescente aliases apenas quando a identidade estiver documentada. Cada relação precisa distinguir grau, orientação principal, coorientação ou vínculo de pós-doc, com fonte rastreável e data da consulta. Uma ligação de mestrado não vira ancestralidade de doutorado. Preserve as ressalvas sobre papéis formais não confirmados; não deduza orientação de coautoria, instituição comum ou pós-doc.

Ancestrais externos usados para contextualizar uma árvore não entram automaticamente nos totais de titulações orientadas pela comunidade. Se a mesma tese existir nas duas camadas, a integração deve identificá-la pelo registro estável e evitar duplicação. Conservar separadas as evidências de uma pessoa, de uma titulação e de cada vínculo de orientação.

Ao ampliar essa camada, verificar IDs únicos no conjunto combinado, referências de pessoas/orientadores resolvidas, ausência de titulações duplicadas e de ciclos de orientação doutoral. O validador `validate-history.py` valida a base `history.json`; `test-history-genealogy.cjs` verifica também os dados adicionais e o módulo preservado.

## Validação local

Execute os comandos a partir da raiz da fonte Hugo:

```powershell
python scripts/validate-history.py
hugo --environment production --minify
python scripts/validate-history.py --rendered-root public
```

Os testes dos módulos desativados continuam disponíveis para preservar a integridade do código e das fontes extras, mas não substituem a revisão dos três painéis ativos:

```powershell
node --test scripts/test-history-collaborations.cjs scripts/test-history-genealogy.cjs
```

Para conferir paridade de uma migração específica, `validate-history.py` também aceita `--before-root` com os arquivos de referência `membros.pt.before.html` e `membros.en.before.html`. Não rode novamente `import-history.py` como rotina de manutenção: é um importador de snapshots legados que pode sobrescrever a fonte mantida. Não execute o antigo `audit_supervisions.py` para validar o site.

Antes de uma publicação autorizada:

1. Confirmar menus e troca de língua em `/historia/` e `/en/historia/`. Devem existir somente Formação, Artigos e Instituições, com Formação como opção inicial.
2. Abrir o JSON indicado por `data-source`, validar sua sintaxe e conferir se seus dados correspondem às fontes ativas, sem eventos ou ancestralidade adicional. Os CSS/JS e links internos precisam existir na saída compilada.
3. Verificar os três painéis em desktop e celular, nos modos claro/escuro; usar teclado, filtrar docentes e titulações, selecionar anos, conferir CSV e selecionar um estado no mapa institucional.
4. Gerar a saída de release limpa, seguindo o processo de publicação existente. Compilar ou validar não publica o site.
