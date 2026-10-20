# Instaladores sem assinatura — 20/10/2026

**Reconstrução em andamento:** o build 39415798451 acrescenta uma única repetição segura da leitura de identidade após timeout do transporte. Os links abaixo identificam os candidatos anteriores, já aceitos no escopo descrito, sem essa correção. A nova série ainda não está aprovada.

Os três candidatos atuais foram gerados e passaram instalação, motores originais, OCR/exportações, backup de núcleo, restauração independente, desinstalação e leitura remota integral por SHA-256/tamanho em [39408346878](https://github.com/giodevopss/plataforma-aberta/actions/runs/39408346878). O código empacotado é `6a362060e734311f4c67ede3e8fb987ef34b7a86`.

Incluem as correções de encerramento HTTP, compartilhamento canônico Mac, proteção Postiz após interrupção da confirmação do COMMIT e cópia explícita de configurações a partir do ASAR. Nos três pacotes, os 54 arquivos públicos de configuração correspondem aos hashes originais, e o método real de produção materializa o schema original Formbricks. Windows também passou cinco rodadas independentes de interface/encerramento.

**A aceitação conjunta dos doze aplicativos continua pendente. Estes pacotes são candidatos de validação; ainda não constituem a distribuição profissional final aprovada.** A ausência de assinatura foi autorizada pelo proprietário. [Critérios verificáveis](release-readiness.json).

| Sistema | Pacote | Tamanho exato | SHA-256 |
| --- | --- | ---: | --- |
| Mac Apple Silicon | [Baixar DMG](https://github.com/giodevopss/plataforma-aberta/releases/download/installer-validation-39408346878-darwin-arm64/Plataforma-Aberta-0.2.0-alpha.1-mac-arm64.dmg) | 820079984 bytes | `668d16b3d53b0ddd4fab9b8b6a7a1eb97b3fb1475d3a66d38561b39f2263016c` |
| Mac Intel | [Baixar DMG](https://github.com/giodevopss/plataforma-aberta/releases/download/installer-validation-39408346878-darwin-x64/Plataforma-Aberta-0.2.0-alpha.1-mac-x64.dmg) | 830814943 bytes | `51f56ea9efee1e0ad4e69b89d5bdb3bcbd8949281375b7857fc50ea8a5476865` |
| Windows x64 | [Baixar EXE](https://github.com/giodevopss/plataforma-aberta/releases/download/installer-validation-39408346878-win32-x64/Plataforma-Aberta-0.2.0-alpha.1-win-x64.exe) | 687123961 bytes | `2b66aebe0e1d59aa208e0ac45722e737fea426e352db978305f755c2485c8782` |

O backup conjunto dos quatro providers nativos passou nos três sistemas em [39410563459](https://github.com/giodevopss/plataforma-aberta/actions/runs/39410563459). A troca manual anterior → atual → anterior passou no [Windows 39410566551](https://github.com/giodevopss/plataforma-aberta/actions/runs/39410566551) e nos [dois Macs 39411832479](https://github.com/giodevopss/plataforma-aberta/actions/runs/39411832479). Os [184 testes públicos](https://github.com/giodevopss/plataforma-aberta/actions/runs/39411234198) passaram nos quatro sistemas. [Comprovantes permanentes atuais](https://github.com/giodevopss/plataforma-aberta/releases/tag/acceptance-installed-suite-39408346878), com leitura remota integral conferida.

Os testes completos dos doze aplicativos no pacote atual continuam no [Windows 39410583334](https://github.com/giodevopss/plataforma-aberta/actions/runs/39410583334) e no [Mac Intel 39411829185](https://github.com/giodevopss/plataforma-aberta/actions/runs/39411829185). Esses dois testes ainda não estão aprovados. Evidências históricas identificam seus próprios pacotes e não substituem a aceitação atual.

Os instaladores pesados permanecem nas Releases públicas. Aplicativos, bancos e modelos são preparados no computador do usuário conforme o uso; backups e credenciais não fazem parte dos downloads. Os ambientes de QA desta rodada são descartáveis e remotos; este Mac recebe somente código e relatórios pequenos.

O backup binário de serviços exige a mesma arquitetura Linux; os perfis nativos exigem o mesmo sistema. Migração lógica entre ARM/Intel e atualizações que alterem esquemas exigem validação específica. Não há atualização automática habilitada.
