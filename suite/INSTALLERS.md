# Instaladores 1.0.0 sem assinatura — 20/10/2026

Os três candidatos passaram geração, instalação real, motores originais, OCR/exportações, consistência da versão, backup de núcleo, restauração independente, desinstalação e leitura remota integral por tamanho/SHA-256 em [39441248424](https://github.com/giodevopss/plataforma-aberta/actions/runs/39441248424). Código empacotado: `9a00d66ba8235acb3af992a5aa16e7578bdecc2a`.

Incluem encerramento HTTP com drenagem de gravações, compartilhamento canônico Mac, marcador durável Postiz após perda de confirmação de COMMIT, materialização das configurações a partir do ASAR e repetição limitada de consultas somente de leitura após falhas tipadas de transporte. A leitura de identidade no Windows tem prazo próprio de60segundos para inicialização ocupada; isso não altera os prazos dos comandos de dados. A identidade privada é conferida novamente a cada tentativa. Comandos que alteram dados, SQL e Compose não são repetidos. Os 54 arquivos públicos e o schema original Formbricks passaram no aplicativo instalado dos três sistemas. Windows também passou cinco rodadas independentes de interface e encerramento.

**A aceitação conjunta dos doze aplicativos permanece pendente. Estes pacotes são candidatos de validação.** A ausência de assinatura foi autorizada; todos os critérios funcionais continuam obrigatórios. [Critérios atuais](release-readiness.json).

| Sistema | Pacote | Tamanho exato | SHA-256 |
| --- | --- | ---: | --- |
| Mac Apple Silicon | [Baixar DMG](https://github.com/giodevopss/plataforma-aberta/releases/download/installer-validation-39441248424-darwin-arm64/Plataforma-Aberta-1.0.0-mac-arm64.dmg) | 820081132 bytes | `0c2fda3c695ee6df3c29b0bf60d05df7b16e02a4fc22a51afbe56721c3dfe325` |
| Mac Intel | [Baixar DMG](https://github.com/giodevopss/plataforma-aberta/releases/download/installer-validation-39441248424-darwin-x64/Plataforma-Aberta-1.0.0-mac-x64.dmg) | 830814826 bytes | `2bd474879cb9924f7b23d74ff9aac44f0c3dccf05b1b6da3b35d7945df7bd40e` |
| Windows x64 | [Baixar EXE](https://github.com/giodevopss/plataforma-aberta/releases/download/installer-validation-39441248424-win32-x64/Plataforma-Aberta-1.0.0-win-x64.exe) | 687120449 bytes | `6325b466d90b31745b245bc826af18ea02eb78f7b4e75788c44ec772f53a7cb2` |

Os [197 testes públicos](https://github.com/giodevopss/plataforma-aberta/actions/runs/39441271174) passaram em Linux, Mac ARM, Mac Intel e Windows. Os seis testes privados da fronteira de publicação/limpeza passaram localmente.

| Validação dos mesmos pacotes 1.0.0 | Run | Estado |
| --- | --- | --- |
| Doze aplicativos, Mac Intel VZ | 39443605925 | Em execução |
| Doze aplicativos, Windows WSL | 39443610976 | Em execução |
| Presenton, Mac Intel | 39427759578 | Em execução |
| Postiz, Mac Intel / Windows | 39443622602 / 39427780987 | Em execução |
| Formbricks / Baserow, Mac Intel | 39427768434 / 39427771853 | Em execução |
| Backup conjunto dos quatro providers nativos | 39443616169 | Em execução ou fila |
| Troca de 0.2.0 para 1.0.0 e retorno, três sistemas | 39427315482 | Em execução ou fila |

Os pacotes anteriores 39416790463 passaram o backup nativo conjunto nos três sistemas e troca/retorno em 39418079066 e 39418082879. Esses resultados são históricos e não substituem os testes dos novos bytes 1.0.0. O Postiz corrigido passou conta/calendário/mídia, reinício, cópias criptografadas encadeadas e perda real de confirmação após COMMIT em Linux Intel 39416799467 e Linux ARM 39416803339; a validação Mac permanece aberta.

Instaladores pesados ficam nas Releases públicas. Aplicativos, bancos e modelos são preparados no computador do usuário conforme o uso; backups e credenciais não fazem parte dos downloads. Esta rodada usa runners públicos padrão gratuitos e ambientes descartáveis; este Mac recebe apenas código e relatórios pequenos.

Snapshots binários de serviços exigem a mesma arquitetura Linux; perfis nativos exigem o mesmo sistema. Migração lógica ARM/Intel e atualizações que alterem esquemas necessitam validação específica. Não há atualização automática habilitada. A cobertura de serviços Linux ARM, interface Mac ARM e transporte no Mac físico é declarada separadamente da recuperação conjunta em Mac Intel/Windows.
