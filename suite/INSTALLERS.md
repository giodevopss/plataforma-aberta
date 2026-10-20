# Instaladores sem assinatura — 20/10/2026

Pacotes internos da suíte completa de aplicativos originais. Build, instalação, edição/exportação, backup de núcleo, restauração independente, desinstalação e leitura remota integral passaram nos três alvos em [39382729111](https://github.com/giodevopss/plataforma-aberta/actions/runs/39382729111).

Os quatro providers de editores, voz/modelo e vídeo passaram juntos no backup real dos pacotes instalados: Windows [39383733571](https://github.com/giodevopss/plataforma-aberta/actions/runs/39383733571), Macs [39384574048](https://github.com/giodevopss/plataforma-aberta/actions/runs/39384574048). [Nove relatórios permanentes conferidos](https://github.com/giodevopss/plataforma-aberta/releases/tag/acceptance-installed-suite-39382729111). A troca real para o pacote atual e retorno ao anterior preservou os documentos nos três sistemas: Windows [39383737792](https://github.com/giodevopss/plataforma-aberta/actions/runs/39383737792), Macs [39384569999](https://github.com/giodevopss/plataforma-aberta/actions/runs/39384569999).

**Aceitação conjunta dos doze aplicativos ainda em execução. Estes pacotes não são a distribuição profissional final.** A assinatura permanece ausente por escolha informada do proprietário, que ainda não possui certificados. Os critérios atuais estão em [release-readiness.json](release-readiness.json).

| Sistema | Pacote | Tamanho exato | SHA-256 |
| --- | --- | ---: | --- |
| Mac Apple Silicon | [Baixar DMG](https://github.com/giodevopss/plataforma-aberta/releases/download/installer-validation-39382729111-darwin-arm64/Plataforma-Aberta-0.2.0-alpha.1-mac-arm64.dmg) | 820093903 bytes | `9d2539e5f7cf87982187f6befae9f30ed1fed45be2ff2df12bc98552190bcddd` |
| Mac Intel | [Baixar DMG](https://github.com/giodevopss/plataforma-aberta/releases/download/installer-validation-39382729111-darwin-x64/Plataforma-Aberta-0.2.0-alpha.1-mac-x64.dmg) | 830843137 bytes | `597f7dfb22983a3c3ffadf2ea67122ba39ca46ceec2d2279eeb245d067717646` |
| Windows x64 | [Baixar EXE](https://github.com/giodevopss/plataforma-aberta/releases/download/installer-validation-39382729111-win32-x64/Plataforma-Aberta-0.2.0-alpha.1-win-x64.exe) | 687118288 bytes | `91b8ae6a45ba4309c2b477c91ba436dc16f11cfb37ccacf7a1075d2573a8ee98` |

Os pacotes pesados permanecem nas Releases públicas. Os aplicativos, bancos e modelos locais são preparados no computador do usuário conforme o uso; os backups e credenciais não fazem parte desses downloads.

O backup de serviços exige a mesma arquitetura Linux; os perfis nativos exigem o mesmo sistema. Migrações lógicas de bancos entre ARM/Intel e atualizações que alterem os esquemas dos aplicativos exigem validação específica. Não há atualização automática habilitada.
