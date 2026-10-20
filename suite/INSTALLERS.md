# Instaladores 1.0.0 sem assinatura — 20/10/2026

Os três candidatos passaram geração, instalação real, motores originais, OCR/exportações, consistência da versão, backup de núcleo, restauração independente, desinstalação e leitura remota integral por tamanho/SHA-256 em [39425731995](https://github.com/giodevopss/plataforma-aberta/actions/runs/39425731995). Código empacotado: `251a1fef6bb2b366ad36fb0fd72e88920955bace`.

Incluem encerramento HTTP com drenagem de gravações, compartilhamento canônico Mac, marcador durável Postiz após perda de confirmação de COMMIT, materialização das configurações a partir do ASAR e repetição limitada de consultas somente de leitura após falhas tipadas de transporte. A identidade privada é conferida novamente a cada tentativa. Comandos que alteram dados, SQL e Compose não são repetidos. Os 54 arquivos públicos e o schema original Formbricks passaram no aplicativo instalado dos três sistemas. Windows também passou cinco rodadas independentes de interface e encerramento.

**A aceitação conjunta dos doze aplicativos permanece pendente. Estes pacotes são candidatos de validação.** A ausência de assinatura foi autorizada; todos os critérios funcionais continuam obrigatórios. [Critérios atuais](release-readiness.json).

| Sistema | Pacote | Tamanho exato | SHA-256 |
| --- | --- | ---: | --- |
| Mac Apple Silicon | [Baixar DMG](https://github.com/giodevopss/plataforma-aberta/releases/download/installer-validation-39425731995-darwin-arm64/Plataforma-Aberta-1.0.0-mac-arm64.dmg) | 820080978 bytes | `e21a257043f5d64147e54c13e1d554a8db30632859d22f3c12fdda7139da1573` |
| Mac Intel | [Baixar DMG](https://github.com/giodevopss/plataforma-aberta/releases/download/installer-validation-39425731995-darwin-x64/Plataforma-Aberta-1.0.0-mac-x64.dmg) | 830814851 bytes | `8a0a0e1e4de601d458d1c9eb5492ff75f1b0f26ca946fc07a8b94ac8f521a683` |
| Windows x64 | [Baixar EXE](https://github.com/giodevopss/plataforma-aberta/releases/download/installer-validation-39425731995-win32-x64/Plataforma-Aberta-1.0.0-win-x64.exe) | 687120240 bytes | `111f958888775a3ef78d3bd69d2feceb240769a19c494d788b0cde8e4f4137b7` |

Os [193 testes públicos](https://github.com/giodevopss/plataforma-aberta/actions/runs/39425739658) passaram em Linux, Mac ARM, Mac Intel e Windows. A rodada seguinte inclui dois novos testes de QA; os testes da fronteira privada permanecem locais.

| Validação dos mesmos pacotes 1.0.0 | Run | Estado |
| --- | --- | --- |
| Doze aplicativos, Mac Intel VZ | 39427751248 | Em execução |
| Doze aplicativos, Windows WSL | 39427755146 | Em execução |
| Presenton, Mac Intel | 39427759578 | Em execução |
| Postiz, Mac Intel / Windows | 39427763688 / 39427780987 | Em execução |
| Formbricks / Baserow, Mac Intel | 39427768434 / 39427771853 | Em execução |
| Backup conjunto dos quatro providers nativos | 39427775990 | Em execução ou fila |
| Troca de 0.2.0 para 1.0.0 e retorno, três sistemas | 39427315482 | Em execução ou fila |

Os pacotes anteriores 39416790463 passaram o backup nativo conjunto nos três sistemas e troca/retorno em 39418079066 e 39418082879. Esses resultados são históricos e não substituem os testes dos novos bytes 1.0.0. O Postiz corrigido passou conta/calendário/mídia, reinício, cópias criptografadas encadeadas e perda real de confirmação após COMMIT em Linux Intel 39416799467 e Linux ARM 39416803339; a validação Mac permanece aberta.

Instaladores pesados ficam nas Releases públicas. Aplicativos, bancos e modelos são preparados no computador do usuário conforme o uso; backups e credenciais não fazem parte dos downloads. Esta rodada usa runners públicos padrão gratuitos e ambientes descartáveis; este Mac recebe apenas código e relatórios pequenos.

Snapshots binários de serviços exigem a mesma arquitetura Linux; perfis nativos exigem o mesmo sistema. Migração lógica ARM/Intel e atualizações que alterem esquemas necessitam validação específica. Não há atualização automática habilitada. A cobertura de serviços Linux ARM, interface Mac ARM e transporte no Mac físico é declarada separadamente da recuperação conjunta em Mac Intel/Windows.
