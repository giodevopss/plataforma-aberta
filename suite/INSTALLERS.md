# Instaladores sem assinatura — 20/10/2026

Os três candidatos atuais passaram geração, instalação real, motores originais, OCR/exportações, backup de núcleo, restauração independente, desinstalação e leitura remota integral por tamanho/SHA-256 em [39416790463](https://github.com/giodevopss/plataforma-aberta/actions/runs/39416790463). Código empacotado: `babf14c1f760f89e67743842b28dc9f4a83f4b14`.

Incluem encerramento HTTP correto, compartilhamento canônico Mac, marcador durável Postiz após perda de confirmação de COMMIT, cópia de configurações a partir do ASAR e uma única repetição da leitura de identidade após timeout do transporte. Nenhum comando que altera dados é repetido. Os 54 arquivos públicos e o schema original Formbricks passaram no pacote real dos três sistemas. Windows também passou cinco rodadas independentes de interface/encerramento.

O limite Elasticsearch do Postiz passou para 1 GiB, mantendo o heap original de 256 MiB, após OOM real reproduzido no Mac. Temporal agora aguarda a saúde real de Elasticsearch e PostgreSQL. Os workflows originais completos corrigidos passaram em [Linux Intel 39416799467](https://github.com/giodevopss/plataforma-aberta/actions/runs/39416799467) e [Linux ARM 39416803339](https://github.com/giodevopss/plataforma-aberta/actions/runs/39416803339); o pacote Mac corrigido ainda está em validação.

**A aceitação conjunta dos doze aplicativos permanece pendente. Estes pacotes são candidatos de validação e ainda não constituem a distribuição profissional final aprovada.** O proprietário autorizou a ausência de assinatura; todos os critérios funcionais continuam obrigatórios. [Critérios atuais](release-readiness.json).

| Sistema | Pacote | Tamanho exato | SHA-256 |
| --- | --- | ---: | --- |
| Mac Apple Silicon | [Baixar DMG](https://github.com/giodevopss/plataforma-aberta/releases/download/installer-validation-39416790463-darwin-arm64/Plataforma-Aberta-0.2.0-alpha.1-mac-arm64.dmg) | 820080623 bytes | `df1d404814676ca7f8f1688181acc365e5d02afb5428fe7b69c4e6e61a2c32b8` |
| Mac Intel | [Baixar DMG](https://github.com/giodevopss/plataforma-aberta/releases/download/installer-validation-39416790463-darwin-x64/Plataforma-Aberta-0.2.0-alpha.1-mac-x64.dmg) | 830814971 bytes | `87b92a88ed8f74c72e892ba2d74ebf86c5f8257c94a9d316aa467f5970b01e5d` |
| Windows x64 | [Baixar EXE](https://github.com/giodevopss/plataforma-aberta/releases/download/installer-validation-39416790463-win32-x64/Plataforma-Aberta-0.2.0-alpha.1-win-x64.exe) | 687124310 bytes | `2dd7524fa783da31f5ff20e2e0083e8707ce95cf8694ecd908c15aad73086855` |

Todos os [188 testes públicos](https://github.com/giodevopss/plataforma-aberta/actions/runs/39416795803) passaram em Linux, Mac ARM, Mac Intel e Windows; 193 testes locais passaram sem falhas/skips.

| Validação atual dos pacotes | Run | Estado |
| --- | --- | --- |
| Doze aplicativos, Mac Intel | [39418067912](https://github.com/giodevopss/plataforma-aberta/actions/runs/39418067912) | Pendente |
| Doze aplicativos, Windows | [39418071399](https://github.com/giodevopss/plataforma-aberta/actions/runs/39418071399) | Pendente |
| Postiz, Mac Intel / Windows | 39418075197 / 39418086055 | Pendente |
| Backup conjunto de quatro providers nativos | 39418079066 | Pendente |
| Troca manual e retorno dos pacotes | 39418082879 | Pendente |

Os pacotes anteriores 39408346878 passaram backup nativo conjunto nos três sistemas e troca/retorno; [14 comprovantes históricos](https://github.com/giodevopss/plataforma-aberta/releases/tag/acceptance-installed-suite-39408346878) foram conferidos integralmente. Não substituem a aceitação dos pacotes novos.

Instaladores pesados permanecem nas Releases públicas. Aplicativos, bancos e modelos são preparados no computador do usuário conforme o uso; backups e credenciais não fazem parte dos downloads. Esta rodada usa runners públicos padrão gratuitos e ambientes descartáveis; este Mac recebe apenas código e relatórios pequenos.

Backup binário de serviços exige a mesma arquitetura Linux; perfis nativos exigem o mesmo sistema. Migração lógica ARM/Intel e atualizações que alterem esquemas necessitam validação específica. Não há atualização automática habilitada. A cobertura dos serviços Linux ARM, da interface Mac ARM e do transporte no Mac físico é declarada separadamente da recuperação conjunta em Mac Intel/Windows.
