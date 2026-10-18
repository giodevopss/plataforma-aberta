# IA local do Presenton

O motor oficial Ollama v0.40.6 é fixado pelo digest de índice multi-plataforma em desktop/src/local-model.json. Qwen3 4B Q4_K_M usa o manifesto e todos os blobs oficiais, verificados integralmente por SHA-256 antes de ativar o nome do modelo. As licenças MIT do motor e Apache-2.0 do modelo estão nesta pasta.

O motor roda na rede privada do aplicativo, sem porta publicada nem credenciais pessoais. O modo cloud está desativado, o contexto limitado a 2048 tokens e o modelo descarregado ao fim da chamada. Os modelos ficam na pasta de dados do Presenton e entram no backup unificado com os escritores pausados. O aplicativo não utiliza a instalação Ollama do usuário e não executa scripts de instalação remotos.

Fontes: https://github.com/ollama/ollama/tree/v0.40.6 e https://ollama.com/library/qwen3:4b

A aceitação da geração real, desempenho em CPU, recuperação e os três instaladores ainda precisa passar antes da distribuição final.
