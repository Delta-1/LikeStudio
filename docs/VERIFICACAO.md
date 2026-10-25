# Verificação — LikeStudio

Data: 25/10/2026.

## História verificada

O usuário conecta sua chave, conclui o onboarding, cria conteúdo pelo assistente, acompanha a fila na galeria, abre o resultado, confere fontes, altera textos e exporta os arquivos.

## Testes automatizados

16 cenários passando com `npm test`:

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


## Correção da conexão Gemini

Os registros de produção mostraram tentativas de conexão rejeitadas com HTTP 400 na validação local. A validação anterior limitava o campo a 200 caracteres e exigia um alfabeto fixo; em caso de erro, a interface apagava o valor digitado.

Correções verificadas:

- Normalização de espaços, quebras de linha, caracteres invisíveis, aspas, prefixos `GEMINI_API_KEY=`, `GOOGLE_API_KEY=` e `x-goog-api-key:`.
- Credenciais tratadas como valores opacos, com limite de 4096 caracteres. A autenticidade continua sendo verificada pelo Google; não há liberação por formato apenas.
- Chave normalizada antes de cifrar; uma falha não sobrescreve a conexão válida anterior.
- Causas conhecidas de erro do Google traduzidas para mensagens úteis, sem retornar mensagens brutas, metadados ou segredos.
- Chave permanece no campo mascarado após erro, sem ser gravada no armazenamento do navegador nem em atributos HTML.
- Enter envia a validação; campo e botões ficam bloqueados durante a consulta e são liberados ao final.
- Diagnóstico no servidor contém apenas código conhecido de falha e status, sem a chave.

No navegador de testes, uma máscara inválida produziu a mensagem de erro e manteve o valor preenchido. Em seguida, uma chave fictícia com prefixo e aspas avançou para a etapa de identidade. Os testes do adaptador usam respostas controladas do Google. A chave real do usuário não foi acessada nem usada.
