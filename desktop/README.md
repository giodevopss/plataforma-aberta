# Plataforma Aberta — suíte local

A suíte executa os aplicativos, bancos, arquivos e modelos no computador do usuário. Os [instaladores atuais sem assinatura](../suite/INSTALLERS.md) foram gerados e testados em Mac Apple Silicon, Mac Intel e Windows x64. **A aceitação conjunta dos doze aplicativos ainda está pendente; os pacotes continuam candidatos de validação.** Consulte [STATUS](../suite/STATUS.md) e [release-readiness.json](../suite/release-readiness.json).

## Aplicativos originais

- Excalidraw e Graphite Rust/WASM/Svelte: motores completos integrados, formatos editáveis e armazenamento local. As versões reduzidas do laboratório ficam fora do produto.
- Presenton, AFFiNE, Baserow, Activepieces, Paperless, Formbricks, Plane e Postiz: serviços originais completos no lançador local, com imagens fixadas por digest, dados separados e gateway autenticado. Serviços iniciam conforme o uso.
- OpenWhispr: fonte original completa com treze adaptações publicadas; 803 arquivos de testes originais executados, com 7.938 testes aprovados, 35 skips originais e um todo. Componentes nativos completos para os três alvos; transcrição local e recuperação de áudio/modelo aceitas.
- Screenity: extensão original completa, Chromium próprio verificado e identidade estável. Reprodução sintética, recorte real, exportação MP4/WebM decodificada e recuperação fria do projeto original foram aceitos nos três sistemas.

Licenças, fontes correspondentes, versões fixadas, hashes e adaptações acompanham o projeto. Os aplicativos mantêm seus termos originais. Recursos Enterprise não são desbloqueados. Assets restritos do Graphite foram substituídos por Lucide ISC e SVGs próprios.

## Instalação e uso

Os DMGs e o instalador NSIS ficam nas Releases, com tamanho exato e SHA-256 em [INSTALLERS](../suite/INSTALLERS.md). O proprietário autorizou a distribuição sem assinatura; nenhuma contratação de certificados foi iniciada. No Mac, o DMG contém o aplicativo e o atalho para Applications. No Windows, o instalador permite escolher o diretório e mantém os dados separados da instalação.

Quadros, vetores, OCR e aplicativos nativos acompanham o pacote. Para os serviços, abra **Configurações → Preparar serviços locais**. O primeiro preparo baixa componentes verificados e cria uma máquina Linux privada Lima no Mac ou uma distro WSL2 própria no Windows. A preparação pode solicitar requisitos/reinício do Windows. Downloads de serviços e modelos são grandes; o produto confere espaço antes da instalação. Nenhum servidor central é necessário.

Cada serviço pode ser encerrado nas configurações. Instalação, parada e recuperação identificam somente recursos pertencentes à suíte; outros contêineres, volumes e runtimes não são gerenciados. Publicação em redes sociais e conectores de terceiros continuam exigindo contas/permissões próprias dos respectivos serviços.

## Persistência e recuperação

`Workspace` mantém quadros, histórico e anexos por hash em SQLite. Graphite usa seu IndexedDB/OPFS original: a integração solicita salvamento explícito e aguarda a barreira original de gravação antes de navegar, recarregar ou realizar backup.

**Configurações → Salvar backup da suíte** coordena SQLite, armazenamento tipado do navegador, serviços frios, modelos e perfis nativos instalados em um `.pasuite` AES-256-GCM por streaming. Feche as janelas de voz e gravação antes de salvar. A senha não é armazenada; guarde-a com o backup.

**Verificar restauração** autentica o arquivo antes de preparar um perfil independente. Serviços recuperados são verificados em cópias sacrificiais isoladas, sem portas publicadas ou acesso externo. O candidato permanece sem iniciar servidores até a ativação explícita. **Usar restauração e reiniciar** mantém o perfil anterior para retorno caso o primeiro início falhe.

A interface conserva também **Exportar quadros**, identificado como backup Excalidraw. Não confunda esse arquivo com o backup unificado da suíte. A recuperação conjunta de editores, voz/modelo e vídeo passou nos três pacotes atuais; o teste conjunto dos doze aplicativos ainda está pendente.

Snapshots binários de serviços exigem a mesma arquitetura Linux. Perfis nativos exigem o mesmo sistema operacional. Migração lógica ARM/Intel ou entre sistemas necessita validação própria. Postiz mantém um marcador durável durante a realocação de mídia: se houver interrupção após COMMIT, um novo backup fica bloqueado até reabrir o aplicativo e concluir a retomada idempotente.

## Verificação e distribuição

Node 24.12 e dependências fixadas no lockfile. Há 189 testes locais aprovados, sem falhas/skips; os 184 testes públicos passaram nos quatro alvos em 39411234198. Os cinco testes da fronteira privada permanecem locais. Os testes originais de OpenWhispr são adicionais a essa contagem.

Os três instaladores 39408346878 passaram instalação real, motores originais, OCR/exportações, backup de núcleo, restauração independente, desinstalação e leitura remota integral por tamanho/SHA-256. Os 54 arquivos públicos de configuração e a materialização real do schema Formbricks a partir do ASAR passaram em todos os pacotes. Windows também passou cinco rodadas independentes de interface/encerramento.

O backup conjunto dos quatro providers nativos passou em 39410563459 nos três pacotes. Troca manual de pacote e retorno, preservando documentos originais e trabalho mais novo, passaram no Windows 39410566551 e nos dois Macs 39411832479. Isso não representa atualização automática nem migração de esquemas alterados. Os [14 comprovantes atuais](https://github.com/giodevopss/plataforma-aberta/releases/tag/acceptance-installed-suite-39408346878) foram conferidos integralmente após publicação.

A cobertura de serviços Linux ARM, interface nativa Mac ARM e transporte no Mac físico é registrada separadamente: o hardware do runner Mac ARM gratuito não oferece virtualização VZ. Mac Intel executa uma VM VZ real nos testes; Windows usa WSL2 real. O teste dos doze aplicativos com recuperação conjunta precisa passar antes da aprovação final.

Os workflows usam apenas runners públicos padrão gratuitos e ambientes descartáveis. Backups, credenciais e chave de recuperação continuam privados; os artefatos públicos atuais excluem logs brutos, screenshots, bancos e perfis. Builds, instaladores, toolchains e modelos pesados ficam na nuvem. Veja [o procedimento de preservação](../scripts/distribution/README.md) e [o estado verificável](../suite/STATUS.md).

O build final continua exigindo versão estável e todos os critérios funcionais aprovados. A assinatura pode ser dispensada somente com a autorização registrada e a opção explícita `PA_ALLOW_UNSIGNED_RELEASE=1` (ou `require-release.mjs --unsigned`); isso não dispensa nenhum teste de aplicativo, plataforma, runtime, recuperação ou troca manual. Os candidatos atuais não passam esse critério final.
