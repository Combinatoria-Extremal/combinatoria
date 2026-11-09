# Histórico acadêmico: fonte única e manutenção

`data/history.json` alimenta o painel Formação e os gráficos históricos, além das listas de pós-doutorandos e estudantes formados em Membros, em português e inglês. Não mantenha listas paralelas em Markdown. O shortcode `supervision-list` gera ambas as versões a partir dos mesmos registros.

A migração de 08/11/2026 preservou **140 titulações** (102 mestrados acadêmicos, 5 mestrados profissionais e 33 doutorados) e **38 estágios de pós-doutorado** (34 concluídos, 4 atuais). As 181 pessoas incluem orientandos, docentes e orientadores externos necessários para representar os vínculos já documentados. Não é um cadastro completo de ancestrais acadêmicos.

## Esquema

- `updated`: data ISO da última alteração no conjunto.
- `people`: pessoas únicas com `id`, `name`, `aliases`, `facultyId` e `url`. Os 19 docentes reutilizam exatamente os IDs de `faculty.json`. Aliases são grafias da mesma pessoa, não nomes aproximados. `url: null` significa que não foi cadastrada uma homepage própria. Nos docentes, `phdYear` e `phdSources` preservam os metadados de `faculty.json`; não criam uma titulação catalogada nem uma aresta de orientação.
- `degrees`: uma entrada por titulação, com `id`, `personId`, `level` (`masters`, `professional-masters` ou `phd`), `institution`, `year` (conclusão), `startYear` confirmado ou nulo, `displayPeriod: {pt, en}`, `advisors`, `sources`, `notes: {pt, en}` e `verification`.
- `postdocs`: uma entrada por estágio, com os mesmos campos de identificação, instituição, orientação e proveniência, mais `reportedYear`, `startYear`, `endYear` e `status` (`completed` ou `current`). Um estágio não é uma titulação. `reportedYear` é o ano exibido no catálogo; em períodos, é a última data numérica informada. Não deve ser interpretado automaticamente como início, conclusão ou duração.
- `advisors`: referências `{personId, role, label?: {pt, en}}`. `role` aceita `advisor`, `coadvisor`, `joint` e `institutional`. A mesma titulação pode ter vários orientadores; continua sendo contada uma só vez.
- `sources`: registros `{label, kind, checked, url?}`. `checked` registra a data da evidência ou da auditoria preservada, não uma nova consulta feita pela migração. Campos adicionais como `local_evidence` e `verified_fields` mantêm a rastreabilidade. Caminhos locais são relativos ao workspace da auditoria, não homepages dos pesquisadores.
- `verification`: preserva `auditRecordId`, `externalStatus`, `confirmedFields`, `startYearStatus`, `auditDate` e, quando existentes, `sourceDistinction` e `startYearFollowup`. A existência de uma fonte não confirma automaticamente todos os campos.
- `coverage`: contagens, limites e proveniência geral da auditoria. Atualize os totais ao acrescentar ou retirar registros.

Os campos opcionais `displayName` e `displayRoles: {pt, en}` preservam as grafias e os rótulos publicados antes da migração. Em `displayRoles`, cada linha é separada por `\n`; o validador confere se os nomes e papéis correspondem aos vínculos estruturados. Para novos registros, prefira omitir esses campos: o shortcode usa os nomes canônicos e traduz os papéis automaticamente. `notes` contém texto simples, nunca HTML ou links nos nomes.

## Limites que devem ser preservados

1. **64 inícios de curso legados não estão confirmados.** Seus períodos continuam em `displayPeriod`, mas `startYear` permanece nulo. Dois outros registros com evidência de seleção/presença datada também não foram convertidos em datas de ingresso. Não calcule duração nem número de alunos ativos a partir desses textos.
2. Uma data isolada de pós-doutorado não estabelece um intervalo. Os três estágios de Vinícius apresentados somente por ano têm `startYear` e `endYear` nulos. As fontes preservam separadamente a evidência institucional e a confirmação fornecida pelo usuário.
3. Renato Carmo e Daniel Morgato Martin têm uma relação adicional `joint`, com `formalRoleConfirmed: false` e `displayInNotes: true`. A fonte relata orientação em conjunto; não permite rotular o participante adicional como coorientador formal.
4. Teeradej Kittipassorn tem Nicolau Corção Saldanha como orientador institucional. O fato de Rob Morris também o listar entre seus pós-doutorandos fica em `associations` e na nota; não cria coorientação formal.
5. O tipo `internal_catalogue` registra a transcrição da página do site. É explicitamente diferente de verificação externa independente. A migração não realizou novas consultas à internet nem reexecutou `audit_supervisions.py`.
6. Afiliações atuais dos docentes não permitem reconstruir vínculos institucionais passados ou datas de entrada e saída da comunidade.

## Atualizar um registro

1. Procure primeiro `personId` e `aliases`, inclusive se a pessoa já tem outro grau ou estágio. Reutilize o ID.
2. Acrescente ou corrija o grau/estágio no JSON, sem duplicar a entrada para cada orientador. Preserve a distinção entre orientação, coorientação e supervisão institucional.
3. Inclua a evidência, a data e quais campos ela sustenta. Informações não confirmadas ficam nulas; texto histórico pode ser preservado em `displayPeriod` ou `notes` com explicação explícita.
4. Atualize traduções, `updated` e contagens em `coverage`. A ordem dos arrays determina a ordem das listas de Membros; a numeração decrescente é automática.
5. Execute o validador e o build. Não publique automaticamente.

```powershell
python extremal_update_20261106/source/scripts/validate-history.py
hugo --source extremal_update_20261106/source --environment production --minify
```

O validador verifica identidades, aliases, referências, papéis exibidos, fontes, limites de datas, contagens, duplicatas e ausência de ciclos no grafo de doutorado. Para a base inicial, use também `--expected-degrees 140 --expected-postdocs 38`.

## Proveniência e reprodução da migração

A fonte de evidências foi `final_audit_20261107/supervisions_audit.json`, cotejada com as listas PT/EN vigentes. Os snapshots originais e o build usado para comparação estão em `history_implementation_20261108/data-backup` e `data-preview`, no workspace de trabalho. O script de importação não é um atualizador periódico: ele requer snapshots explícitos e recusa sobrescrever o JSON existente sem `--force`.

```powershell
python extremal_update_20261106/source/scripts/import-history.py --pt-source history_implementation_20261108/data-backup/membros.md --en-source history_implementation_20261108/data-backup/membros.en.md --audit final_audit_20261107/supervisions_audit.json
```

`--migrate` substitui somente os corpos das duas listas longas nas páginas de Membros por shortcodes. Não é necessário após a primeira migração. A paridade do texto renderizado, ignorando apenas espaços HTML, foi conferida com:

```powershell
python extremal_update_20261106/source/scripts/validate-history.py --expected-degrees 140 --expected-postdocs 38 --rendered-root history_implementation_20261108/data-preview --before-root history_implementation_20261108/data-backup
```

Esse teste também garante que os nomes dos pós-doutorandos e estudantes continuam sem links nas listas de Membros.
