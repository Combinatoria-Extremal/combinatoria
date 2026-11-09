# Combinatória Extremal no Brasil

Portal em https://extremal.combinatoria.org/.

A pasta [`source/`](source/) contém a fonte editável Hugo, os arquivos centrais de dados e o tema necessário para reproduzir o site. Os arquivos da raiz são a versão publicada no GitHub Pages.

Leia [`source/README.md`](source/README.md) para atualizar docentes, artigos, orientações, prêmios, eventos e materiais. Na pasta `source`, execute `python scripts/update-site.py`. O comando valida e gera uma prévia em `source/public/`; não publica automaticamente.

Para publicar, prepare uma pasta de saída nova com `--destination output/release --require-empty-destination`, revise o resultado e copie os arquivos dessa saída para a raiz deste repositório, preservando `.git/` e `source/`. Faça commit da fonte e da saída revisadas juntas.
