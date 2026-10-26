# LikeStudio

Estúdio de conteúdo para Instagram: entre, conecte sua chave Gemini e transforme uma ideia em carrossel, post, story ou vídeo. Interface em português com a identidade escura, roxa e minimalista do ONLY.

## Fluxo

1. Onboarding: chave Gemini → validação sem geração paga → nome, @ e cor opcionais.
2. Galeria com busca, filtros, grade/lista e progresso de cada criação.
3. **Novo conteúdo**: formato → assunto e pesquisa → estilo, tom e idioma → confirmar.
4. Pesquisa com fontes → roteiro → imagens → composição dos textos → narração/vídeo → arquivos.
5. Revise o resultado, edite títulos/corpos/legenda sem gerar novas imagens e baixe PNG, MP4 ou ZIP.

Os prompts de pesquisa, direção editorial, roteiro e imagens estão em `lib/content.js`. O usuário não precisa escrever prompts técnicos.

## O que funciona

- Carrosséis de 3, 5, 7 ou 10 páginas, posts e stories.
- PNG em 1080 × 1350 (feed) e 1080 × 1920 (story).
- Vídeos verticais MP4 em 720 × 1280, com 2, 3 ou 5 cenas pela interface.
- Vídeo narrado: imagens originais + textos na tela + narração Gemini + movimento suave.
- Vídeo com cenas geradas: Gemini Omni Flash + textos compostos pelo servidor + áudio retornado pelo modelo. O prompt solicita aproximadamente 8 segundos por cena; a duração efetiva depende do modelo.
- Notícias por período, URLs efetivamente retornadas na busca, resumo consultável e sugestões do Google em iframe isolado.
- Idiomas do conteúdo: português, espanhol e inglês.
- Modelos de conteúdo prontos, quatro estilos visuais, tom e instruções opcionais.
- Identidade de marca aplicada a cada projeto; temas claro/escuro.
- Fila real, cancelamento, retomada com checkpoints e preservação de arquivos concluídos.
- Edição de textos e legenda, revisão marcada pelo usuário, downloads individuais e pacote ZIP com fontes/roteiro.
- Chaves Gemini cifradas com AES-256-GCM no servidor. Cookie de sessão HttpOnly e isolamento por espaço.
- SQLite e mídia persistentes; sem necessidade de uma chave global do dono do sistema.

## Executar

Requer **Node.js 24+**, **FFmpeg**, **FFprobe** e fontes DejaVu. No Debian/Ubuntu:

```sh
sudo apt-get update
sudo apt-get install ffmpeg fonts-dejavu-core
npm ci
npm start
```

Abra `http://localhost:3000`. A chave real é informada somente no aplicativo. Não a adicione ao repositório.

Ou, com Docker:

```sh
docker compose up --build -d
```

O volume `likestudio-data` preserva banco, mídias e chave de cifragem. Não remova esse volume ao atualizar.

## Publicação no Railway

O repositório inclui `Dockerfile` com FFmpeg/fontes e `railway.json` com healthcheck em `/healthz`.

1. Conecte este repositório a um serviço Railway.
2. Anexe um **volume persistente em `/data`** antes de receber usuários.
3. Use uma única réplica (SQLite e fila local). `DATA_DIR=/data` já vem no Dockerfile.
4. Gere um domínio HTTPS para a porta 3000 ou a porta fornecida pelo Railway.
5. Abra o site e conecte sua chave no onboarding.

O GitHub Pages abre o `index.html` da raiz e encaminha automaticamente para [o LikeStudio publicado](https://likestudio-production.up.railway.app/). Se o redirecionamento estiver desativado no navegador, a página oferece o botão **Entrar no LikeStudio**. A proteção das chaves, a fila, a pesquisa e a renderização de vídeos usam o servidor Node. O frontend e o backend são servidos no mesmo domínio. Um proxy deve preservar o cabeçalho Host.

## Variáveis

| Variável | Padrão | Uso |
| --- | --- | --- |
| `PORT` | `3000` | Porta HTTP |
| `DATA_DIR` | `.data` (local), `/data` (Docker) | Banco, arquivos e segredo local |
| `ENCRYPTION_KEY` | Gerada em `DATA_DIR/encryption.key` | Opcional; segredo estável para cifrar as chaves |

Faça backup do diretório de dados completo, incluindo o segredo de cifragem. Alterar `ENCRYPTION_KEY` impede abrir as chaves cifradas anteriormente. A aplicação não registra chaves ou respostas brutas de erro do provedor.

## Modelos padrão

Preferências iniciais, conferidas na documentação oficial em 25/10/2026. Antes de gerar, o sistema consulta os modelos retornados para a chave conectada e substitui preferências indisponíveis por modelos compatíveis. Ajustes → Modelos de IA também oferece **Ajustar automaticamente**.

| Etapa | Modelo |
| --- | --- |
| Pesquisa e roteiro | `gemini-3.8-flash` |
| Imagens | `gemini-nano-banana-2.1` |
| Narração | `gemini-3.8-flash-lite-tts` |
| Cenas de vídeo | `gemini-omni-1.1-flash` |

Pesquisa, roteiro, imagens e narração usam o endpoint REST `models/{model}:generateContent`, com leitura de `candidates[].content.parts[]` e `groundingMetadata`. Vídeos Omni usam a Interactions API com leitura de `steps[].content[]`. A seleção respeita a modalidade e os métodos retornados por `models.list`. Áudio PCM de modelos anteriores é convertido para WAV antes de montar o vídeo. Solicitações de roteiro explicitamente rejeitadas por campo de schema desconhecido podem ser reenviadas uma vez com o formato REST alternativo documentado; falhas de cota, créditos ou timeout não repetem a geração automaticamente.

A chave precisa ter acesso aos modelos escolhidos, cota e faturamento. **O uso é cobrado pelo Google.** A validação lista modelos; não garante cota de geração. Não há geração fictícia ou fallback silencioso em produção. Erros de permissão, cota, modelo, bloqueio ou timeout aparecem na criação.

## Persistência e limites desta versão

- O espaço pertence ao cookie deste navegador. Não há login, sincronização entre aparelhos nem recuperação após limpar cookies. Baixe os arquivos importantes.
- Até 2 criações simultâneas por espaço; 2 trabalhadores no processo; até 200 conteúdos por espaço.
- Ao reiniciar o servidor, criações em andamento ficam interrompidas. O usuário decide retomar para evitar repetir automaticamente chamadas potencialmente cobradas.
- Cancelar não desfaz a cobrança de chamadas já enviadas ao provedor.
- Notícias exigem busca efetivamente realizada e fontes retornadas. A presença de fontes não substitui a revisão humana.
- Os textos são compostos separadamente da imagem para manter legibilidade e permitir edição. Visuais gerados são identificados como ilustrações.
- Ao editar um vídeo, os textos na tela mudam, mas a narração original é mantida. A interface informa isso.
- Não publica automaticamente no Instagram. Exporta arquivos para revisão e publicação pelo usuário.
- A capacidade total depende do volume contratado; monitore espaço em disco e exclua conteúdos que não precisa.

## Verificação

```sh
npm run check
npm test
```

Testes usam um provedor controlado **somente em `tests/`** e exercitam o servidor, SQLite, arquivos PNG/ZIP e FFmpeg real. Não consomem créditos. O adaptador Gemini é verificado contra o formato documentado; a geração paga precisa ser validada com uma chave real no ambiente publicado.

Para testar a interface sem créditos, use `npm run test:ui`. Esse comando serve um ambiente de teste isolado com respostas controladas e chave fictícia descrita em `tests/helpers.js`. **Nunca use esse comando em produção.** O Docker copia apenas os arquivos de produção e inicia `server.js`.

Consulte [docs/VERIFICACAO.md](docs/VERIFICACAO.md) para o registro das verificações.

## Referências oficiais

- [Chaves Gemini](https://ai.google.dev/gemini-api/docs/api-key)
- [Modelos](https://ai.google.dev/gemini-api/docs/models)
- [Busca e fontes](https://ai.google.dev/gemini-api/docs/google-search)
- [Imagens](https://ai.google.dev/gemini-api/docs/image-generation)
- [Narração](https://ai.google.dev/gemini-api/docs/speech-generation)
- [Vídeos](https://ai.google.dev/gemini-api/docs/omni)
- [Preços](https://ai.google.dev/gemini-api/docs/pricing)
