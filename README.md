# Qual é a Música?

Jogo de adivinhar música brasileira. Você ouve meio segundo de um trecho e tenta
acertar o nome. Cada erro libera mais tempo — 2s, 5s, 10s, 15s — e a graça é
acertar com o menor trecho possível.

**3.375 músicas** em 11 gêneros: sertanejo, pagode/samba, forró, MPB, funk, rock
nacional, axé/bossa nova, pop, rap, gospel, além da categoria "Top 2000+".

## Como funciona

- Os trechos saem da prévia de 30s de cada música (`previewUrl`), tocada por um
  `<audio>` comum. Sem player externo e sem anúncio, o som começa no instante
  do clique.
- O autocomplete ignora acentos e aceita pequenos erros de digitação: "ze neto"
  encontra "Zé Neto & Cristiano".
- Junto das músicas reais há ~1.050 "iscas" (`data/decoys.js`): músicas que
  aparecem na busca mas nunca são a resposta. Sem elas, um artista com uma única
  música cadastrada entregaria a resposta pela busca.
- Sequência e recorde ficam no `localStorage` do navegador.

## Rodando localmente

É um site estático, sem build. Sirva por HTTP:

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
| `data/songs.js` | Músicas jogáveis (com a URL da prévia) |
| `data/decoys.js` | Iscas do autocomplete (sem áudio) |

## Adicionando músicas

Em `data/songs.js`, cada entrada segue o formato:

```js
{id:"rock-50",title:"Título",artist:"Artista",genre:"rock",previewUrl:"https://...",youtubeId:"XXXXXXXXXXX"}
```

O `genre` precisa ser um dos definidos em `GENRE_LABELS` (`app.js`). A
`previewUrl` sai da busca do iTunes, no campo `previewUrl` do resultado:

```
https://itunes.apple.com/search?media=music&country=BR&term=ARTISTA+MUSICA
```

Essa API limita a ~20 buscas por minuto e responde 403 ao estourar — ao cadastrar
muitas de uma vez, espace as chamadas em ~3s e trate o 403 como "tentar de novo",
não como "música sem prévia".

O `youtubeId` não é mais usado para tocar; fica só como referência da origem do
cadastro.

Ao cadastrar uma música nova, remova de `data/decoys.js` qualquer isca com o mesmo
título e artista, senão ela aparece duplicada na busca.
