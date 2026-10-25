# Verificação — LikeStudio

Data: 25/10/2026.

## História verificada

O usuário conecta sua chave, conclui o onboarding, cria conteúdo pelo assistente, acompanha a fila na galeria, abre o resultado, confere fontes, altera textos e exporta os arquivos.

## Testes automatizados

11 cenários passando com `npm test`:

- Chave cifrada no SQLite/WAL, sem exposição na sessão.
- Isolamento de conteúdo e arquivos entre sessões; bloqueio de origem externa.
- Carrossel completo com PNG de 1080 × 1350, fontes no ZIP e roteiro sem segredo.
- Edição efetiva da imagem final sem novas chamadas ao gerador.
- Retomada após falha sem repetir pesquisa, roteiro ou imagem concluída.
- Cancelamento e desconexão da chave preservando a galeria.
- Persistência após reabrir o banco; fila interrompida não repete chamadas automaticamente.
- Vídeo narrado com WAV e FFmpeg reais, edição e download com Range HTTP.
- Vídeo de cenas geradas com composição de textos e MP4 real.
- Payload Interactions REST, bloqueio de pesquisa sem fontes e mensagens sem vazamento de erro do provedor.
- Validação de entrada antes de enviar chamadas pagas.

Os cenários usam `FakeProvider` somente em testes; nenhuma chave real foi fornecida. O adaptador real não foi exercitado contra geração paga.

## Navegador

Verificado no Chrome do ambiente de desenvolvimento:

- Explorar galeria vazia; navegação e visual escuro inspirado no ONLY.
- Onboarding completo com chave fictícia em servidor de testes isolado.
- Assistente: formato → pauta/pesquisa → estilo/quantidade → revisão.
- Criação iniciada e cartão atualizado automaticamente.
- Abertura de página, referências, resumo de pesquisa e downloads disponíveis.
- Edição do título refletida na prévia e no arquivo final.

Galeria e assistente também conferidos em um iframe de teste com viewport de 390 × 844, ativando as mesmas regras responsivas usadas em celular. Não foi usado um aparelho físico.

## Produção

- `server.js` usa exclusivamente o adaptador Gemini real.
- Docker não inclui o provedor de testes.
- Healthcheck `/healthz` confirma disponibilidade de FFmpeg/FFprobe.
- Persistência depende do volume montado em `/data`.
- Acesso e cota dos modelos serão confirmados quando o usuário conectar uma chave válida.
