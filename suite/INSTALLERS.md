# Instaladores sem assinatura — 20/10/2026

Pacotes internos da suíte completa de aplicativos originais. Build, instalação, edição/exportação, backup de núcleo, restauração independente, desinstalação e leitura remota integral passaram nos três alvos em [39392937729](https://github.com/giodevopss/plataforma-aberta/actions/runs/39392937729).

Os quatro providers de editores, voz/modelo e vídeo passaram juntos no backup real dos pacotes anteriores (39382729111): Windows [39383733571](https://github.com/giodevopss/plataforma-aberta/actions/runs/39383733571), Macs [39384574048](https://github.com/giodevopss/plataforma-aberta/actions/runs/39384574048). [Nove relatórios permanentes conferidos](https://github.com/giodevopss/plataforma-aberta/releases/tag/acceptance-installed-suite-39382729111). A troca real para o pacote atual e retorno ao anterior preservou os documentos nos três sistemas: Windows [39383737792](https://github.com/giodevopss/plataforma-aberta/actions/runs/39383737792), Macs [39384569999](https://github.com/giodevopss/plataforma-aberta/actions/runs/39384569999).

Os candidatos acima incluem a correção de encerramento HTTP, verificada em cinco rodadas independentes no Windows. A reconstrução 39396457365 acrescenta a correção de compartilhamento canônico Mac e ainda está em teste.

**Aceitação conjunta dos doze aplicativos ainda em execução. Estes pacotes não são a distribuição profissional final.** A assinatura permanece ausente por escolha informada do proprietário, que ainda não possui certificados. Os critérios atuais estão em [release-readiness.json](release-readiness.json).

| Sistema | Pacote | Tamanho exato | SHA-256 |
| --- | --- | ---: | --- |
| Mac Apple Silicon | [Baixar DMG](https://github.com/giodevopss/plataforma-aberta/releases/download/installer-validation-39392937729-darwin-arm64/Plataforma-Aberta-0.2.0-alpha.1-mac-arm64.dmg) | 820102428 bytes | `7313ca2c838fd4990cbebc52ea7f91a1dba88409f0d56134c3f5a6940aeb9dbd` |
| Mac Intel | [Baixar DMG](https://github.com/giodevopss/plataforma-aberta/releases/download/installer-validation-39392937729-darwin-x64/Plataforma-Aberta-0.2.0-alpha.1-mac-x64.dmg) | 830818417 bytes | `ae2bd20d4f50268a4c6bf39daf010a0276bc089ba238617732da6918e065afb3` |
| Windows x64 | [Baixar EXE](https://github.com/giodevopss/plataforma-aberta/releases/download/installer-validation-39392937729-win32-x64/Plataforma-Aberta-0.2.0-alpha.1-win-x64.exe) | 687121279 bytes | `aa2e30a9b661c7b2e8a2182aaaa5cd8239f5e30755856448093796de93b0b86b` |

Os pacotes pesados permanecem nas Releases públicas. Os aplicativos, bancos e modelos locais são preparados no computador do usuário conforme o uso; os backups e credenciais não fazem parte desses downloads.

O backup de serviços exige a mesma arquitetura Linux; os perfis nativos exigem o mesmo sistema. Migrações lógicas de bancos entre ARM/Intel e atualizações que alterem os esquemas dos aplicativos exigem validação específica. Não há atualização automática habilitada.
