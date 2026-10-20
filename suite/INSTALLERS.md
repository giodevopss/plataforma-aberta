# Instaladores sem assinatura — 20/10/2026

Os três pacotes atuais passaram build, instalação, motores originais, OCR/exportações, backup de núcleo, restauração independente, desinstalação e leitura remota integral por SHA-256/tamanho em [39396457365](https://github.com/giodevopss/plataforma-aberta/actions/runs/39396457365). Incluem as correções de encerramento HTTP e caminhos canônicos do compartilhamento Mac; Windows exige cinco rodadas independentes de UI/encerramento.

O backup conjunto de editores, voz/modelo e vídeo no **pacote atual** passou no [Windows 39397807052](https://github.com/giodevopss/plataforma-aberta/actions/runs/39397807052) e nos [dois Macs 39398442190](https://github.com/giodevopss/plataforma-aberta/actions/runs/39398442190). [Comprovantes atuais permanentes e conferidos](https://github.com/giodevopss/plataforma-aberta/releases/tag/acceptance-installed-suite-39396457365). Todos os [178 testes públicos](https://github.com/giodevopss/plataforma-aberta/actions/runs/39397633591) passaram em Linux, Mac ARM, Mac Intel e Windows.

**A aceitação conjunta dos doze aplicativos ainda está em execução. Estes pacotes não são a distribuição profissional final aprovada.** A ausência de assinatura foi autorizada pelo proprietário. Os critérios atuais estão em [release-readiness.json](release-readiness.json).

| Sistema | Pacote | Tamanho exato | SHA-256 |
| --- | --- | ---: | --- |
| Mac Apple Silicon | [Baixar DMG](https://github.com/giodevopss/plataforma-aberta/releases/download/installer-validation-39396457365-darwin-arm64/Plataforma-Aberta-0.2.0-alpha.1-mac-arm64.dmg) | 820102001 bytes | `8f99f9f573c36461cf2e394788c077be9a394f52ee32ef5a76c566c645ebaa78` |
| Mac Intel | [Baixar DMG](https://github.com/giodevopss/plataforma-aberta/releases/download/installer-validation-39396457365-darwin-x64/Plataforma-Aberta-0.2.0-alpha.1-mac-x64.dmg) | 830818385 bytes | `818a45864f22c4b45fc98ec1a7f80ca21ac47af19605f7dd68fd472b8220c3b0` |
| Windows x64 | [Baixar EXE](https://github.com/giodevopss/plataforma-aberta/releases/download/installer-validation-39396457365-win32-x64/Plataforma-Aberta-0.2.0-alpha.1-win-x64.exe) | 687121217 bytes | `149ff2e6451e99e56b301d76ef6a8e7d5193af6ef4b9e4e1e808ceaa9881007b` |

Os instaladores pesados ficam nas Releases públicas. Aplicativos, bancos e modelos são preparados localmente conforme o uso; backups e credenciais não fazem parte dos downloads. Os ambientes de QA desta rodada são descartáveis e remotos.

A troca manual anterior → atual → anterior passou em Windows e Mac ARM; o Mac Intel continua em teste em [39398557675](https://github.com/giodevopss/plataforma-aberta/actions/runs/39398557675). Troca/retorno dos pacotes anteriores já passaram (39383737792 e 39384569999); os [relatórios históricos](https://github.com/giodevopss/plataforma-aberta/releases/tag/acceptance-installed-suite-39382729111) não substituem a aceitação atual.

O backup binário de serviços exige a mesma arquitetura Linux; os perfis nativos exigem o mesmo sistema. Migração lógica entre ARM/Intel e atualizações que alterem esquemas exigem validação específica. Não há atualização automática habilitada.
