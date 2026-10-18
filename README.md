# Plataforma Aberta

Suíte local para macOS e Windows, com aplicativos originais completos: Excalidraw, Graphite, Presenton, AFFiNE, Baserow, Activepieces, Paperless-ngx, Formbricks, Plane, Postiz, OpenWhispr e Screenity.

**A distribuição final ainda está em validação.** Não há instalador final aprovado. Os critérios em [suite/release-readiness.json](suite/release-readiness.json) impedem publicar versões finais antes da aceitação completa.

## Código e privacidade

Este repositório tem histórico novo e contém somente código, testes sintéticos, fontes de adaptações, metadados públicos e atribuições. Não contém bancos, sessões, credenciais, backups, modelos pessoais ou evidências antigas. Builds e testes usam runners padrão gratuitos de Linux, macOS ARM/Intel e Windows. Nenhum workflow precisa de token para um repositório privado.

## Verificar

Requer Node.js 24.12.

```sh
npm ci --prefix desktop
cd desktop
npm test
```

O workflow **Build public original engines** recupera os commits exatos com restore-upstream.mjs, compila Excalidraw e Graphite completos, obtém a extensão Screenity original com checksum e publica somente componentes e licenças. Outros workflows verificam a receita e todos os bytes antes dos testes nativos. Componentes internos não são instaladores finais.

## Licenças

O código independente da suíte usa MIT. Fontes/adaptações de terceiros mantêm as licenças originais; veja [THIRD_PARTY.md](THIRD_PARTY.md), os manifests de proveniência e os avisos incluídos nos builds. As versões Community e suas restrições são preservadas.
