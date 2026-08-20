# Qual é a Música?

Jogo de adivinhar música brasileira. Você ouve meio segundo de um trecho e tenta
acertar o nome. Cada erro libera mais tempo — 2s, 5s, 10s, 15s — e a graça é
acertar com o menor trecho possível.

**463 músicas** em 11 gêneros: sertanejo, pagode/samba, forró, MPB, funk, rock
nacional, axé/bossa nova, pop, rap, gospel, além da categoria "Top 2000+".

## Como funciona

- Os trechos são tocados via YouTube IFrame API, a partir de um ponto calculado
  ~30% da duração do vídeo (evita intro/vinheta).
- O autocomplete ignora acentos e aceita pequenos erros de digitação: "ze neto"
  encontra "Zé Neto & Cristiano".
- Junto das músicas reais há ~1.050 "iscas" (`data/decoys.js`): músicas que
  aparecem na busca mas nunca são a resposta. Sem elas, um artista com uma única
  música cadastrada entregaria a resposta pela busca.
- Sequência e recorde ficam no `localStorage` do navegador.

## Rodando localmente

É um site estático, sem build. Precisa ser servido por HTTP (a API do YouTube não
funciona via `file://`):

```bash
python -m http.server 8791
```

Depois abra <http://localhost:8791>.

## Estrutura

| Arquivo | O que é |
| --- | --- |
| `index.html` | Estrutura da página |
| `style.css` | Estilos |
| `app.js` | Lógica do jogo, busca e player |
| `data/songs.js` | Músicas jogáveis (com ID do YouTube) |
| `data/decoys.js` | Iscas do autocomplete (sem ID) |

## Adicionando músicas

Em `data/songs.js`, cada entrada segue o formato:

```js
{id:"rock-50",title:"Título",artist:"Artista",genre:"rock",youtubeId:"XXXXXXXXXXX"}
```

O `genre` precisa ser um dos definidos em `GENRE_LABELS` (`app.js`), e o
`youtubeId` deve ser de um vídeo público e embutível — dá para conferir em
`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=ID&format=json`.

Ao cadastrar uma música nova, remova de `data/decoys.js` qualquer isca com o mesmo
título e artista, senão ela aparece duplicada na busca.
