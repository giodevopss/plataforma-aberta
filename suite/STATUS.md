# Estado verificável — 20/10/2026

As doze integrações usam aplicativos originais completos, commits/imagens fixados e adaptações publicadas. Os três instaladores 1.0.0 foram gerados, instalados e testados. A aceitação conjunta continua aberta; `release-readiness.json` mantém esse critério fechado. A distribuição sem assinatura foi autorizada e não dispensa os testes funcionais.

## Aceito

- **201 testes locais**, sem falhas/skips. **193 testes públicos** passaram nos quatro alvos em 39425739658; a rodada 39427789885 acrescenta dois testes de QA e aguarda as vagas Mac. Seis testes da fronteira privada permanecem locais.
- **Três instaladores 1.0.0 39425731995**, código `251a1fe`: geração, instalação, editores originais, OCR/exportações, consistência da versão, backup de núcleo, restauração independente, desinstalação e leitura remota integral por tamanho/SHA-256. Os 54 arquivos públicos e o schema Formbricks a partir do ASAR passaram em todos. Windows passou cinco rodadas independentes de interface/encerramento.
- **Postiz em Linux Intel/ARM**: conta/calendário/mídia, interface nativa/reinício, cópias criptografadas encadeadas e perda real de confirmação após COMMIT com retomada segura passaram em 39416799467 e 39416803339. Elasticsearch tem limite de1GiB com heap256MiB e Temporal aguarda dependências saudáveis. O resultado Mac continua pendente.
- **Troca manual real de0.2 para1.0 e retorno**, documentos originais Excalidraw/Graphite e trabalho SQLite novo preservados: os checks funcionais passaram nos três sistemas em39427315482. Ambos os jobs Mac concluíram. O job Windows falhou depois, na limpeza dos temporários do runner; o novo teste exige remoção real com prazo limitado antes da aceitação final.
- **Histórico separado**: candidatos0.2 39416790463 passaram recuperação conjunta dos quatro providers nativos em39418079066 e troca/retorno em39418082879, nos três sistemas. Não substituem os testes dos bytes1.0 atuais.
- **OpenWhispr**: treze adaptações,803 arquivos originais,7938 testes aprovados,35 skips originais e um todo; componentes nativos para os três alvos.
- **Oito serviços originais**: workflows e recuperação independente aceitos separadamente em Linux Intel/ARM e Windows WSL. Presenton ARM completou geração real Qwen3:4b, PPTX editável, recuperação fria e nova inferência após excluir o modelo de origem. Mac Intel Activepieces e Baserow passaram seus workflows completos anteriormente.

## Validação atual dos mesmos instaladores1.0

| Teste | Run | Estado |
| --- | --- | --- |
| Doze aplicativos, Mac Intel VZ | 39427751248 | Em execução |
| Doze aplicativos, Windows WSL | 39427755146 | Em execução |
| Presenton, Mac Intel | 39427759578 | Em execução |
| Postiz, Mac Intel / Windows | 39427763688 /39427780987 | Em execução ou fila |
| Formbricks / Baserow, Mac Intel | 39427768434 /39427771853 | Em execução ou fila |
| Quatro providers nativos, três sistemas | 39427775990 | Em execução ou fila |

Os testes conjuntos exigem todos os workflows originais, um backup real do produto, verificação em cópias sacrificiais isoladas, ativação explícita, segundo backup antes de abrir servidores recuperados e leitura original dos dados. Nenhum encerramento forçado pode contar como sucesso.

O Formbricks já confirmou sessão original, edição/envio real e reabertura nativa. O teste agora trata somente um `ERR_ABORTED` explícito causado pelo roteador após login, mantendo a exigência de encontrar a resposta preservada. Presenton usa a pasta temporária pertencente ao runner, com a mesma restrição de transporte de QA. Os diagnósticos Postiz mostram apenas enums/booleanos/status HTTP fixos; nenhum log bruto é publicado. Dois módulos de QA omitidos na publicação9ba foram incluídos em bec1, com guarda de dependências e teste contra regressão; execuções afetadas foram canceladas ou falharam cedo e não contam como aceitação.

## Cobertura e privacidade

Serviços Linux ARM, interface nativa Mac ARM e transporte no Mac físico têm cobertura declarada separadamente: o hardware do runner Mac ARM gratuito não oferece VZ. O transporte físico próprio, volumes, sessão autenticada, backup criptografado e recuperação foram aceitos; a VM foi removida. Isso não representa execução conjunta dos oito servidores no Mac ARM físico.

Código revisado e testes sintéticos ficam no repositório público. Backups autorizados e chave de recuperação continuam privados; o repositório de preservação foi confirmado privado. Allowlist/gitleaks excluem histórico privado, bancos, perfis, credenciais e backups. Artefatos atuais de serviços contêm somente JSON sanitizado.

Builds, modelos e ambientes pesados ficam nos runners públicos padrão gratuitos. Este Mac recebe código e relatórios pequenos. Foram liberados870MiB de caches regeneráveis e clone antigo limpo. A recuperação mantém o perfil anterior. Snapshots binários de serviços exigem a mesma arquitetura Linux; perfis nativos exigem o mesmo sistema. Não há atualização automática habilitada.

[Downloads e hashes dos candidatos atuais](INSTALLERS.md).
