# Projetos locais do Screenity

Adaptação GPL-3.0-only do commit dddeeb668ad285155a48fa89298f0fe2ef273579. O patch mostra os dois pontos de integração nas fontes originais. O build oficial completo tem os mesmos dois hooks aplicados somente depois de verificar o SHA-256 integral do bundle. O módulo completo e o patch acompanham a extensão compilada.

O projeto grava mídia binária, corte, título e histórico original em transações IndexedDB com durabilidade estrita. A interface confirma salvamento somente depois do commit; conflitos entre janelas e erros de quota permanecem visíveis. A biblioteca permite reabrir projetos anteriores independentemente do slot de gravação original. O backup frio da suíte inclui esse banco no perfil nativo.
