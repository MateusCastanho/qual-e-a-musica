/* global SONGS, YT */

// "top2000" é um gênero virtual: não filtra por campo `genre`, e sim pelo
// campo `top` (que pode marcar músicas de qualquer gênero, inclusive
// duplicando uma que já aparece em outro card).
const TOP_GENRE_ID = "top2000";

const GENRE_LABELS = {
  "top2000": "Top 2000+",
  "sertanejo": "Sertanejo",
  "pagode-samba": "Pagode / Samba",
  "forro": "Forró",
  "mpb": "MPB",
  "funk": "Funk",
  "rock": "Rock Nacional",
  "axe-bossa": "Axé / Bossa Nova",
  "pop": "Pop",
  "rap": "Rap",
  "gospel": "Gospel",
  "internacional": "Internacional",
};

// Cada gênero tem uma cor própria, que marca o card no lugar de um emoji.
const DAILY_ID = "diaria";
// Data de referência do jogo. O número do dia sai daqui, então mudá-la
// remexeria todas as músicas diárias já jogadas.
const DAILY_EPOCH = Date.UTC(2026, 0, 1);

// Dia corrente no fuso de Brasília: sem isso, quem joga à noite viraria o dia
// antes da meia-noite local (ou depois), e a "mesma música do dia" deixaria
// de ser a mesma para todo mundo.
function diaDeHoje() {
  const agora = new Date();
  const brasilia = new Date(agora.getTime() - 3 * 3600 * 1000);
  const meiaNoite = Date.UTC(brasilia.getUTCFullYear(), brasilia.getUTCMonth(), brasilia.getUTCDate());
  return Math.floor((meiaNoite - DAILY_EPOCH) / 86400000);
}

// Embaralhador determinístico: a mesma semente devolve sempre o mesmo número.
function hashDia(n) {
  let h = (n + 1) * 2654435761 % 4294967296;
  h ^= h >>> 13; h = (h * 1274126177) % 4294967296; h ^= h >>> 16;
  return h >>> 0;
}

// A música do dia sai dos hits: todo mundo pega a mesma, e ela precisa ser
// reconhecível — não faz sentido a do dia ser faixa de álbum obscura.
function musicaDoDia(dia) {
  const pool = SONGS.filter((s) => s.hit);
  const lista = (pool.length ? pool : SONGS).slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  return lista[hashDia(dia) % lista.length];
}

// Décadas: recorte por ano de lançamento, atravessando os gêneros.
const DECADES = {
  "dec-80": { label: "Anos 80", min: 1970, max: 1989 },
  "dec-90": { label: "Anos 90", min: 1990, max: 1999 },
  "dec-00": { label: "Anos 2000", min: 2000, max: 2009 },
  "dec-10": { label: "Anos 2010", min: 2010, max: 2019 },
  "dec-20": { label: "Anos 2020", min: 2020, max: 2099 },
};

// Abaixo disso não vale filtrar por hit: a categoria ficaria pequena demais
// e as mesmas músicas se repetiriam toda hora.
const MIN_POR_CATEGORIA = 12;

// Desafio: rodada fechada de N músicas de um gênero numa década, com placar
// no fim para comparar com os amigos.
const DESAFIO_TAMANHO = 10;

function desafioId(genero, dec) { return "d:" + genero + ":" + dec; }

function partesDesafio(id) {
  if (!id || id.slice(0, 2) !== "d:") return null;
  const [, genero, dec] = id.split(":");
  return { genero, dec };
}

function rotuloDesafio(id) {
  const ano = anoDoId(id);
  if (ano) return "Top 10 de " + ano;
  const p = partesDesafio(id);
  if (!p) return "";
  return GENRE_LABELS[p.genero] + " · " + DECADES[p.dec].label;
}

// Só entram combinações com música suficiente para uma rodada inteira.
function desafiosDisponiveis() {
  const out = [];
  Object.keys(GENRE_LABELS).forEach((g) => {
    if (g === TOP_GENRE_ID) return;
    Object.keys(DECADES).forEach((dec) => {
      const n = musicasDoDesafio(g, dec).length;
      if (n >= DESAFIO_TAMANHO) out.push({ id: desafioId(g, dec), genero: g, dec, n });
    });
  });
  return out;
}

// Uma música de cada ano da década, pegando a mais forte disponível. Se a
// década não tiver 10 anos com material, completa com as demais.
function musicasDoDesafio(genero, dec) {
  const d = DECADES[dec];
  const base = SONGS.filter((s) => s.genre === genero && s.y >= d.min && s.y <= d.max);

  const forca = (s) => (s.top ? 2 : s.hit ? 1 : 0);
  const porAno = {};
  base.forEach((s) => {
    const atual = porAno[s.y];
    if (!atual || forca(s) > forca(atual)) porAno[s.y] = s;
  });

  const umaPorAno = Object.keys(porAno).sort().map((a) => porAno[a]);
  if (umaPorAno.length >= DESAFIO_TAMANHO) return umaPorAno;

  const escolhidas = new Set(umaPorAno.map((s) => s.id));
  const resto = base
    .filter((s) => !escolhidas.has(s.id))
    .sort((a, b) => forca(b) - forca(a));
  return umaPorAno.concat(resto).slice(0, Math.max(DESAFIO_TAMANHO, umaPorAno.length));
}

// ---- desafio por ano: os maiores sucessos daquele ano ----
// `ah` marca o ano em que a música foi hit (nem sempre o de lançamento) e
// `ar` a posição dentro do ano; ambos vêm de pesquisa de paradas.
function anoId(ano) { return "ano:" + ano; }

function anoDoId(id) {
  if (!id || id.slice(0, 4) !== "ano:") return null;
  const n = +id.slice(4);
  return Number.isFinite(n) ? n : null;
}

function musicasDoAno(ano) {
  return SONGS.filter((s) => s.ah === ano).sort((a, b) => (a.ar || 99) - (b.ar || 99));
}

function anosDisponiveis() {
  const c = {};
  SONGS.forEach((s) => { if (s.ah) c[s.ah] = (c[s.ah] || 0) + 1; });
  return Object.keys(c).map(Number).filter((a) => c[a] >= DESAFIO_TAMANHO).sort();
}

const GENRE_ACCENT = {
  "top2000": "#ff5a2c",
  "sertanejo": "#e8b33c",
  "pagode-samba": "#4fb3a4",
  "forro": "#f08a3c",
  "mpb": "#86a85e",
  "funk": "#e8447e",
  "rock": "#d4402b",
  "axe-bossa": "#3fa45b",
  "pop": "#a374d9",
  "rap": "#7c8fa8",
  "gospel": "#d9c05a",
  "dec-80": "#d96f9b",
  "dec-90": "#5f9ee0",
  "dec-00": "#6ec2a0",
  "dec-10": "#d98f4a",
  "dec-20": "#b07de0",
  "internacional": "#4a9ed9",
};

const ATTEMPT_DURATIONS = [0.5, 2, 5, 10, 15]; // seconds

// Pontos por acerto, conforme o trecho que bastou. Acertar com meio segundo
// vale quase 7x acertar com 15s — é o que a patente premia.
const STAGE_POINTS = [100, 60, 40, 25, 15];

// Patentes por pontuação acumulada. A escala é longa de propósito: com mais
// de 3 mil músicas, a antiga (topo em 6 mil pts) se esgotava numa noite.
const RANKS = [
  { min: 0, name: "Ouvinte de Rádio" },
  { min: 500, name: "Fã de Carteirinha" },
  { min: 1500, name: "DJ de Churrasco" },
  { min: 3500, name: "Cabeça de Fone" },
  { min: 7000, name: "Colecionador de Vinil" },
  { min: 12000, name: "Ouvido Absoluto" },
  { min: 20000, name: "Jurado de Calourada" },
  { min: 32000, name: "Maestro de Boteco" },
  { min: 50000, name: "Enciclopédia Musical" },
  { min: 75000, name: "Patrimônio Imaterial" },
];

// Jogar com o catálogo inteiro é bem mais difícil que só com os hits, então
// vale mais ponto — senão não haveria motivo para desligar o filtro.
const BONUS_CATALOGO = 1.6;

function emptyStats() {
  return {
    rounds: 0,
    wins: 0,
    points: 0,
    byStage: ATTEMPT_DURATIONS.map(() => 0),
    byGenre: {}, // { [genreId]: { rounds, wins } }
  };
}

function loadStats() {
  try {
    const raw = JSON.parse(localStorage.getItem("qem_stats"));
    if (!raw || typeof raw !== "object") return emptyStats();
    const base = emptyStats();
    return {
      rounds: Number(raw.rounds) || 0,
      wins: Number(raw.wins) || 0,
      points: Number(raw.points) || 0,
      // o tamanho pode mudar se ATTEMPT_DURATIONS mudar: normaliza
      byStage: base.byStage.map((_, i) => Number(raw.byStage && raw.byStage[i]) || 0),
      byGenre: (raw.byGenre && typeof raw.byGenre === "object") ? raw.byGenre : {},
    };
  } catch {
    return emptyStats();
  }
}

function rankFor(points) {
  let current = RANKS[0];
  let next = null;
  for (let i = 0; i < RANKS.length; i++) {
    if (points >= RANKS[i].min) { current = RANKS[i]; next = RANKS[i + 1] || null; }
  }
  return { current, next };
}

const state = {
  genre: null,
  queue: [],
  currentSong: null,
  attemptIndex: 0, // 0-based, index into ATTEMPT_DURATIONS
  desafio: null,    // rodada fechada em andamento, quando houver
  audio: null,
  ready: false,     // a prévia já carregou o suficiente para tocar?
  playing: false,
  playTimer: null,
  solved: false,
  finished: false,
  history: [], // { type: "skip" | "wrong" | "correct", text, sameArtist }
  streak: Number(localStorage.getItem("qem_streak") || 0),
  bestStreak: Number(localStorage.getItem("qem_best_streak") || 0),
  stats: loadStats(),
  // Padrão ligado: com a base cheia, a maioria das faixas é de álbum e o
  // jogo fica injogável sem esse filtro.
  hitsOnly: localStorage.getItem("qem_hits_only") !== "0",
};

// ---------- utils ----------

// Igual ao normalize, mas SEM cortar em "ft."/"part.". O índice da busca usa
// esta: com o corte, quem participa da faixa ficava invisível — "Loka" era
// indexado como "loka simone e simaria" e procurar "Anitta" não achava nada,
// mesmo sendo a voz que a pessoa reconheceu.
function normalizeCompleto(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " e ")
    .replace(/\b(feat|ft|part)\.?\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " e ")
    .replace(/\(.*?\)/g, "")
    .replace(/\b(feat|ft|part)\.?\b.*$/i, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Decompõe um crédito em duas camadas. normalize() não serve aqui: ela corta
// tudo depois de "ft."/"part.", então quem participa desaparecia — e acertar
// a Anitta em "Major Lazer ft. Anitta" não contava como mesmo artista.
//
//   fortes — cada ato completo do crédito ("zé neto e cristiano")
//   fracos — cada nome solto dentro do ato ("zé neto", "cristiano")
function artistUnits(artist) {
  const limpo = (artist || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)/g, " ");

  const atos = limpo
    .split(/\b(?:feat|ft|part|com)\b\.?/g)
    .map((a) =>
      a.replace(/[&,]/g, " e ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
    )
    .filter(Boolean);

  const fortes = new Set(atos);
  const fracos = new Set();
  atos.forEach((a) =>
    a.split(/\s+e\s+/).forEach((n) => {
      const nome = n.trim();
      if (nome.length >= 2) fracos.add(nome);
    })
  );
  return { fortes, fracos };
}

// Os dois créditos têm algum artista em comum? O nome compartilhado precisa
// ser um ato COMPLETO em pelo menos um dos lados — senão "Guilherme &
// Santiago" casaria com "Hugo & Guilherme", que são Guilhermes diferentes.
function shareArtist(a, b) {
  const A = artistUnits(a);
  const B = artistUnits(b);
  for (const x of A.fortes) if (B.fortes.has(x) || B.fracos.has(x)) return true;
  for (const y of B.fortes) if (A.fracos.has(y)) return true;
  return false;
}

// Palavras que aparecem em crédito mas ninguém é obrigado a digitar: quem
// procura "MC Kevinho" tem que achar a música creditada só "Kevinho", e o
// contrário também.
const PALAVRAS_OPCIONAIS = new Set([
  "mc", "dj", "mr", "banda", "grupo", "trio", "os", "as", "o", "a", "e", "de", "da", "do",
]);

function palavrasDe(str) {
  return normalize(str).split(" ").filter(Boolean);
}

// Casa se cada palavra digitada for começo de alguma palavra do alvo. Assim
// "olha explosao" acha "Olha a Explosão" (sem exigir o "a") e "revelacao
// deixa" acha "Deixa Acontecer - Grupo Revelação" (ordem invertida).
// Palavra opcional que não bate é ignorada, não reprova.
function casaPalavras(consulta, alvo) {
  const q = palavrasDe(consulta);
  if (!q.length) return false;
  const t = palavrasDe(alvo);
  let casouAlguma = false;

  for (const p of q) {
    const bateu = t.some((w) => w.startsWith(p));
    if (bateu) { casouAlguma = true; continue; }
    if (PALAVRAS_OPCIONAIS.has(p)) continue; // "dj kevinho" ainda acha "Kevinho"
    return false;
  }
  return casouAlguma;
}

// Duas entradas são a MESMA gravação, só creditada de formas diferentes?
// Acontece direto: "P do Pecado" existe como "Menos É Mais & Simone Mendes",
// como "Grupo Menos é Mais" e como "Simone Mendes". Chutar qualquer uma
// delas tem que valer acerto.
//
// shareArtist não resolve aqui: ele quebra o crédito em " e ", e nomes como
// "Menos É Mais" viram pedaços soltos.
//
// A regra é contenção, não palavra em comum: o crédito menor tem que caber
// inteiro no maior. "Simone Mendes" cabe em "Menos É Mais & Simone Mendes",
// mas "João Gilberto" não cabe em "João Nogueira" — só dividem o primeiro
// nome. Palavra em comum daria falso positivo em Roberto Menescal/Roberto
// Carlos, Banda Calypso/Banda Eva, Luiz Caldas/Luiz Gonzaga.
const PALAVRAS_GENERICAS = new Set(["banda", "grupo", "trio", "mc", "dj", "part", "feat", "ft"]);

function mesmaMusica(a, b) {
  if (!a || !b) return false;
  if (normalize(a.title) !== normalize(b.title)) return false;
  if (shareArtist(a.artist, b.artist)) return true;

  // Mínimo de 2 letras, não 3: descartar "Zé" deixaria só o sobrenome, e
  // "Zé Vaqueiro" passaria por "Manim Vaqueiro".
  const nomes = (s) =>
    normalize(s).split(" ").filter((w) => w.length >= 2 && !PALAVRAS_GENERICAS.has(w));
  const A = nomes(a.artist);
  const B = nomes(b.artist);
  if (!A.length || !B.length) return false;

  const [menor, maior] = A.length <= B.length ? [A, B] : [B, A];
  const conjunto = new Set(maior);
  return menor.every((w) => conjunto.has(w));
}

// Distância de edição limitada: devolve 99 se claramente maior que 2.
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

// Compara já-normalizados, aceitando pequenos erros de digitação em textos maiores.
function fuzzyEquals(guess, target) {
  if (guess === target) return true;
  if (target.length < 5) return false;
  const tolerance = target.length >= 10 ? 2 : 1;
  return editDistance(guess, target) <= tolerance;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function $(sel) { return document.querySelector(sel); }

function allGuessableSongs() {
  // Reais primeiro: se uma isca repetir título de uma música real, a real vence.
  const decoys = typeof DECOY_SONGS !== "undefined" ? DECOY_SONGS : [];
  return SONGS.concat(decoys);
}

function findSongByGuess(guessRaw) {
  const guessNorm = normalize(guessRaw);
  if (!guessNorm) return null;
  const pool = allGuessableSongs();

  let found = pool.find((s) => fuzzyEquals(guessNorm, normalize(`${s.title} ${s.artist}`)));
  if (found) return found;

  found = pool.find((s) => fuzzyEquals(guessNorm, normalize(s.title)));
  if (found) return found;

  // Entre os títulos contidos no chute, vence o mais longo — o mais
  // específico. Pegar o primeiro fazia "P do Pecado - Grupo Menos é Mais"
  // casar com uma música chamada "Mais", que também está ali dentro.
  const porSubstring = pool.filter((s) => {
    const t = normalize(s.title);
    // t precisa de tamanho mínimo: título de 1-2 letras (ex.: "É") bateria
    // com qualquer chute que contenha essas letras.
    return guessNorm.length >= 3 && t.length >= 4 && (t.includes(guessNorm) || guessNorm.includes(t));
  });
  if (porSubstring.length) {
    return porSubstring.reduce((a, b) =>
      normalize(b.title).length > normalize(a.title).length ? b : a
    );
  }

  // Última tentativa, por palavras soltas ("olha explosao" para "Olha a
  // Explosão"). Só vale se levar a UMA música: com duas ou mais candidatas
  // não dá para saber qual era a intenção, e aceitar a primeira daria um
  // acerto que a pessoa não fez.
  if (palavrasDe(guessNorm).length >= 2) {
    const porPalavras = pool.filter((s) => casaPalavras(guessNorm, `${s.title} ${s.artist}`));
    const ids = new Set(porPalavras.map((s) => s.id || s.title + "|" + s.artist));
    if (ids.size === 1) return porPalavras[0];
  }
  return null;
}

// A sequência saiu do cabeçalho; o recorde continua no painel de estatísticas.
function updateStatsUI() {
  const s = $("#streak");
  if (s) s.textContent = state.streak;
  const b = $("#best-streak");
  if (b) b.textContent = state.bestStreak;
}

// ---------- genre screen ----------

// Todas as músicas de uma categoria, sem olhar dificuldade.
function todasDaCategoria(id) {
  if (id === DAILY_ID) return [musicaDoDia(diaDeHoje())];
  const ano = anoDoId(id);
  if (ano) return musicasDoAno(ano);
  const p = partesDesafio(id);
  if (p) return musicasDoDesafio(p.genero, p.dec);
  if (id === TOP_GENRE_ID) return SONGS.filter((s) => s.top);
  const d = DECADES[id];
  if (d) return SONGS.filter((s) => s.y >= d.min && s.y <= d.max);
  return SONGS.filter((s) => s.genre === id);
}

// O que entra no sorteio, já considerando o modo escolhido. O "Top 2000+" é
// uma seleção de hits por definição, então o filtro não se aplica a ele.
function songsByGenre(id) {
  const base = todasDaCategoria(id);
  // Desafio e diária têm seleção própria e fixa: o botão de dificuldade não
  // pode mexer nelas, senão as "mesmas 10 músicas" mudariam por jogador.
  const fixo = id === TOP_GENRE_ID || id === DAILY_ID || partesDesafio(id) || anoDoId(id);
  if (!state.hitsOnly || fixo) return base;
  const hits = base.filter((s) => s.hit);
  return hits.length >= MIN_POR_CATEGORIA ? hits : base;
}

function renderStatsPanel() {
  const panel = $("#stats-panel");
  const st = state.stats;

  // Sem rodada nenhuma o painel só ocuparia espaço com zeros.
  if (st.rounds === 0) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");

  const { current, next } = rankFor(st.points);
  $("#rank-name").textContent = current.name;
  $("#rank-points").textContent = st.points.toLocaleString("pt-BR");

  if (next) {
    const span = next.min - current.min;
    const done = st.points - current.min;
    $("#rank-fill").style.width = Math.min(100, (done / span) * 100) + "%";
    $("#rank-next").textContent =
      `faltam ${(next.min - st.points).toLocaleString("pt-BR")} pts para ${next.name}`;
  } else {
    $("#rank-fill").style.width = "100%";
    $("#rank-next").textContent = "patente máxima alcançada";
  }

  $("#st-wins").textContent = st.wins;
  $("#st-rounds").textContent = st.rounds;
  $("#st-rate").textContent = Math.round((st.wins / st.rounds) * 100) + "%";
  $("#st-best").textContent = state.bestStreak;

  // Melhor gênero: só compara os que já têm alguma amostra, para não eleger
  // um gênero com 1 rodada e 1 acerto.
  const candidatos = Object.entries(st.byGenre).filter(([, v]) => v.rounds >= 3);
  if (candidatos.length) {
    const melhor = candidatos.sort((a, b) => (b[1].wins / b[1].rounds) - (a[1].wins / a[1].rounds))[0];
    $("#st-fav").textContent = GENRE_LABELS[melhor[0]] || melhor[0];
  } else {
    $("#st-fav").textContent = "—";
  }

  const maior = Math.max(1, ...st.byStage);
  const dist = $("#dist");
  dist.innerHTML = "";
  ATTEMPT_DURATIONS.forEach((dur, i) => {
    const n = st.byStage[i];
    const row = document.createElement("div");
    row.className = "dist-row";
    row.innerHTML =
      `<span class="dist-label">${dur}s</span>` +
      `<span class="dist-bar"><span class="dist-fill" style="width:${(n / maior) * 100}%"></span></span>` +
      `<span class="dist-count">${n}</span>`;
    dist.appendChild(row);
  });
}

function lerDiaria() {
  try { return JSON.parse(localStorage.getItem("qem_diaria")) || null; } catch { return null; }
}

// Grava o andamento da diária a cada jogada, não só no fim. Sem isso,
// atualizar a página no meio recomeçaria a rodada já sabendo a música.
function salvarProgressoDiaria() {
  if (state.genre !== DAILY_ID) return;
  const etapa = Math.min(state.attemptIndex, ATTEMPT_DURATIONS.length - 1);
  localStorage.setItem("qem_diaria", JSON.stringify({
    dia: diaDeHoje(),
    emAndamento: !state.finished,
    attemptIndex: state.attemptIndex,
    history: state.history,
    ganhou: state.solved,
    trecho: ATTEMPT_DURATIONS[etapa],
    tentativa: etapa + 1,
  }));
}

function renderDailyCard() {
  const dia = diaDeHoje();
  const feito = lerDiaria();
  const deHoje = feito && feito.dia === dia;
  const emAndamento = deHoje && feito.emAndamento;
  const jaJogou = deHoje && !feito.emAndamento;
  const box = $("#daily-card");

  let status;
  if (emAndamento) status = `Em andamento · ${feito.attemptIndex} de ${ATTEMPT_DURATIONS.length} tentativas`;
  else if (!deHoje) status = "Ainda não jogada";
  else if (feito.ganhou) status = `Você acertou com ${feito.trecho}s`;
  else status = "Você não acertou hoje";

  box.innerHTML =
    `<div class="daily-info">` +
      `<p class="stats-label">Música do dia · nº ${dia}</p>` +
      `<p class="daily-status">${status}</p>` +
    `</div>` +
    `<div class="daily-acoes">` +
      (jaJogou
        ? `<button type="button" class="modo-btn" id="btn-share">Compartilhar</button>` +
          `<span class="daily-next" id="daily-next"></span>`
        : `<button type="button" class="play-btn daily-play" id="btn-daily">` +
          (emAndamento ? "Continuar" : "Jogar a do dia") + `</button>`) +
    `</div>`;

  if (!jaJogou) {
    $("#btn-daily").addEventListener("click", () => startGenre(DAILY_ID));
  } else {
    $("#btn-share").addEventListener("click", () => compartilharDiaria(dia, feito));
    atualizarContagem();
  }
}

// Quanto falta para a próxima música do dia (meia-noite de Brasília).
function atualizarContagem() {
  const el = $("#daily-next");
  if (!el) return;
  const agora = new Date();
  const b = new Date(agora.getTime() - 3 * 3600 * 1000);
  const proxima = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() + 1);
  const falta = proxima - (agora.getTime() - 3 * 3600 * 1000);
  const h = Math.floor(falta / 3600000);
  const m = Math.floor((falta % 3600000) / 60000);
  el.textContent = `próxima em ${h}h${String(m).padStart(2, "0")}`;
}

function compartilharDiaria(dia, feito) {
  const linha = feito.ganhou
    ? `Acertei com ${feito.trecho}s (${feito.tentativa}ª tentativa)`
    : "Não acertei essa";
  const texto = `Qual é a Música nº ${dia}\n${linha}\n${location.origin}${location.pathname}`;
  const btn = $("#btn-share");
  navigator.clipboard.writeText(texto).then(
    () => { btn.textContent = "Copiado!"; setTimeout(() => (btn.textContent = "Compartilhar"), 1800); },
    () => { btn.textContent = "Não deu para copiar"; setTimeout(() => (btn.textContent = "Compartilhar"), 1800); }
  );
}

// Desafio já jogado não se repete: são sempre as mesmas 10 músicas, então
// refazer seria só reescrever o placar sabendo as respostas. A ficha passa a
// mostrar o resultado e abre o placar guardado em vez de começar de novo.
function criarChipDesafio(id, rotulo, feitos, descricao) {
  const b = document.createElement("button");
  b.type = "button";
  const feito = feitos[id];

  if (feito) {
    b.className = "desafio-chip feito";
    b.textContent = rotulo + " · " + feito.acertos + "/" + feito.total;
    b.setAttribute("aria-label", descricao + " — já jogado, " + feito.acertos + " de " + feito.total);
    b.addEventListener("click", () => mostrarPlacarGuardado(id, feito));
  } else {
    b.className = "desafio-chip";
    b.textContent = rotulo;
    b.setAttribute("aria-label", descricao);
    b.addEventListener("click", () => startGenre(id));
  }
  return b;
}

function mostrarPlacarGuardado(id, feito) {
  $("#screen-genres").classList.add("hidden");
  $("#screen-game").classList.remove("hidden");
  document.body.classList.add("in-game", "mostrando-resultado");

  $("#reveal-label").textContent = "Você já jogou";
  $("#reveal-text").textContent = feito.acertos + " de " + feito.total;
  $("#reveal-sub").textContent = rotuloDesafio(id);
  $("#reveal-sub").classList.remove("hidden");
  $("#desafio-stats").innerHTML =
    `<div class="stats-grid">` +
      `<div class="stat-cell"><b>${feito.pontos}</b><span>pontos</span></div>` +
    `</div>` +
    `<p class="rank-next">Cada desafio tem sempre as mesmas 10 músicas, então só vale jogar uma vez.</p>`;
  $("#desafio-stats").classList.remove("hidden");
  $("#btn-share-desafio").classList.add("hidden");
  $("#btn-ouvir").classList.add("hidden");
  $("#btn-next-song").textContent = "Voltar";
  $("#reveal-card").classList.remove("hidden");
  state.desafio = { id, encerrado: true };
}

function criarCard(id, rotulo) {
  const count = songsByGenre(id).length;
  const card = document.createElement("button");
  card.className = id === TOP_GENRE_ID ? "genre-card genre-card-featured" : "genre-card";
  card.disabled = count === 0;
  card.style.setProperty("--chip", GENRE_ACCENT[id] || "var(--laranja)");
  card.innerHTML =
    `<span class="genre-name">${rotulo}</span>` +
    `<span class="genre-count"><b>${count}</b>músicas</span>`;
  card.addEventListener("click", () => startGenre(id));
  return card;
}

function renderGenreGrid() {
  const grid = $("#genre-grid");
  grid.innerHTML = "";
  Object.keys(GENRE_LABELS).forEach((id) => grid.appendChild(criarCard(id, GENRE_LABELS[id])));

  const grade = $("#decade-grid");
  grade.innerHTML = "";
  Object.entries(DECADES).forEach(([id, d]) => grade.appendChild(criarCard(id, d.label)));

  // Uma linha por gênero, com as décadas que têm música suficiente. Em cards
  // separados isso viraria 44 blocos e uma rolagem sem fim no celular.
  const feitos = lerRecordes();
  const gd = $("#desafio-grid");
  gd.innerHTML = "";
  const desafios = desafiosDisponiveis();
  const porGenero = {};
  desafios.forEach((d) => (porGenero[d.genero] = porGenero[d.genero] || []).push(d));

  Object.keys(GENRE_LABELS).forEach((g) => {
    const lista = porGenero[g];
    if (!lista) return;
    const linha = document.createElement("div");
    linha.className = "desafio-linha";
    linha.style.setProperty("--chip", GENRE_ACCENT[g] || "var(--laranja)");
    linha.innerHTML = `<span class="desafio-genero">${GENRE_LABELS[g]}</span>`;
    const chips = document.createElement("div");
    chips.className = "desafio-chips";
    lista.forEach((d) => {
      chips.appendChild(criarChipDesafio(d.id, DECADES[d.dec].label, feitos,
        GENRE_LABELS[g] + " nos " + DECADES[d.dec].label));
    });
    linha.appendChild(chips);
    gd.appendChild(linha);
  });
  // sem ano nas músicas ainda não há combinação possível
  $("#desafios-label").classList.toggle("hidden", desafios.length === 0);

  // Top 10 do ano: 47 botões soltos viram uma parede, então vão agrupados
  // por década, uma linha cada.
  const ga = $("#ano-grid");
  ga.innerHTML = "";
  const anos = anosDisponiveis();
  Object.entries(DECADES).forEach(([, d]) => {
    const daDecada = anos.filter((a) => a >= d.min && a <= d.max);
    if (!daDecada.length) return;
    const linha = document.createElement("div");
    linha.className = "desafio-linha";
    linha.style.setProperty("--chip", "var(--ouro)");
    linha.innerHTML = `<span class="desafio-genero">${d.label}</span>`;
    const chips = document.createElement("div");
    chips.className = "desafio-chips";
    daDecada.forEach((a) => {
      chips.appendChild(criarChipDesafio(anoId(a), String(a), feitos, "Top 10 de " + a));
    });
    linha.appendChild(chips);
    ga.appendChild(linha);
  });
  $("#ano-label").classList.toggle("hidden", anos.length === 0);

  const btn = $("#btn-hits");
  btn.textContent = state.hitsOnly ? "Só os hits" : "Catálogo inteiro";
  btn.classList.toggle("ligado", state.hitsOnly);
  $("#hits-hint").textContent = state.hitsOnly
    ? "Sorteando só as músicas mais conhecidas de cada categoria."
    : "Sorteando tudo, inclusive faixa de álbum — bem mais difícil.";
}

function startGenre(genreId) {
  state.genre = genreId;
  const ehDesafio = !!(partesDesafio(genreId) || anoDoId(genreId));

  // Desafio não embaralha: são sempre as mesmas 10, na mesma ordem, senão
  // dois amigos comparariam placares de rodadas diferentes. A fila é
  // consumida do fim (pop), então vai invertida para tocar na ordem certa.
  state.queue = ehDesafio
    ? songsByGenre(genreId).slice(0, DESAFIO_TAMANHO).reverse()
    : shuffle(songsByGenre(genreId));

  state.desafio = ehDesafio
    ? {
        id: genreId,
        total: DESAFIO_TAMANHO,
        feitas: 0,
        acertos: 0,
        pontos: 0,
        // quantos acertos em cada trecho, mais os que não saíram
        byStage: ATTEMPT_DURATIONS.map(() => 0),
        falhas: 0,
      }
    : null;
  if (state.desafio) state.queue = state.queue.slice(0, DESAFIO_TAMANHO);

  $("#screen-genres").classList.add("hidden");
  $("#screen-game").classList.remove("hidden");
  document.body.classList.add("in-game");
  nextSong();

  // Diária interrompida: volta ao ponto em que parou. Atualizar a página no
  // meio não devolve as tentativas já gastas.
  if (genreId === DAILY_ID) {
    const salvo = lerDiaria();
    if (salvo && salvo.dia === diaDeHoje() && salvo.emAndamento && salvo.attemptIndex > 0) {
      state.attemptIndex = salvo.attemptIndex;
      state.history = salvo.history || [];
      renderAttempts();
      renderHistory();
    }
  }
}

// Autocomplete própria (não o <datalist> nativo): o datalist filtra por
// substring literal, então "sao paulo" não encontra "São Paulo". Aqui a
// filtragem usa normalize(), então acento/maiúsculas/pequenos erros não
// atrapalham — deliberadamente construída com TODAS as músicas (todo
// gênero), não só as do gênero em jogo, pra não entregar a resposta quando
// um gênero tem poucas músicas.
let suggestionPool = null;
let activeSuggestionIndex = -1;
let currentSuggestionMatches = [];

function getSuggestionPool() {
  if (suggestionPool) return suggestionPool;
  const seen = new Set();
  suggestionPool = allGuessableSongs()
    .filter((s) => {
      const key = normalizeCompleto(`${s.title} ${s.artist}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((s) => ({
      song: s,
      // índice completo: inclui quem participa da faixa
      searchText: normalizeCompleto(`${s.title} ${s.artist}`),
      titleNorm: normalize(s.title),
    }));
  return suggestionPool;
}

function renderSuggestions(query) {
  const box = $("#suggestions-box");
  const q = normalize(query);
  activeSuggestionIndex = -1;

  if (!q) {
    closeSuggestions();
    return;
  }

  // Pontua para o mais provável vir primeiro: quem começa com o que foi
  // digitado ganha de quem só tem as palavras espalhadas.
  const pontuar = (e) => {
    let p = 0;
    if (e.titleNorm === q) p += 100;
    else if (e.titleNorm.startsWith(q)) p += 60;
    else if (e.searchText.includes(q)) p += 30;
    if (casaPalavras(q, e.searchText)) p += 20;
    return p;
  };

  const matches = getSuggestionPool()
    .filter((e) => e.searchText.includes(q) || casaPalavras(q, e.searchText))
    .map((e) => ({ e, p: pontuar(e) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 8)
    .map((x) => x.e);

  currentSuggestionMatches = matches.map((e) => e.song);

  if (matches.length === 0) {
    closeSuggestions();
    return;
  }

  box.innerHTML = "";
  matches.forEach((e, i) => {
    const item = document.createElement("div");
    item.className = "suggestion-item";
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", "false");
    item.id = "sug-" + i;
    item.innerHTML = `<span class="sug-title"></span> <span class="sug-artist"></span>`;
    item.querySelector(".sug-title").textContent = e.song.title;
    item.querySelector(".sug-artist").textContent = "- " + e.song.artist;
    item.addEventListener("mousedown", (ev) => {
      // mousedown (não click) para disparar antes do blur do input
      ev.preventDefault();
      selectSuggestion(e.song);
    });
    box.appendChild(item);
  });
  box.classList.remove("hidden");
  $("#guess-input").setAttribute("aria-expanded", "true");
}

function selectSuggestion(song) {
  const input = $("#guess-input");
  input.value = `${song.title} - ${song.artist}`;
  closeSuggestions();
  input.focus();
}

function closeSuggestions() {
  const box = $("#suggestions-box");
  box.classList.add("hidden");
  box.innerHTML = "";
  activeSuggestionIndex = -1;
  currentSuggestionMatches = [];
  const input = $("#guess-input");
  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");
}

function moveSuggestionActive(delta) {
  const box = $("#suggestions-box");
  const items = [...box.querySelectorAll(".suggestion-item")];
  if (items.length === 0) return;

  const prev = items[activeSuggestionIndex];
  if (prev) {
    prev.classList.remove("active");
    prev.setAttribute("aria-selected", "false");
  }

  activeSuggestionIndex = (activeSuggestionIndex + delta + items.length) % items.length;
  const item = items[activeSuggestionIndex];
  item.classList.add("active");
  item.setAttribute("aria-selected", "true");
  item.scrollIntoView({ block: "nearest" });
  $("#guess-input").setAttribute("aria-activedescendant", item.id);
}

// ---------- game flow ----------

function nextSong() {
  if (state.queue.length === 0) {
    state.queue = shuffle(songsByGenre(state.genre));
  }
  state.currentSong = state.queue.pop();
  state.attemptIndex = 0;
  state.solved = false;
  state.finished = false;
  state.history = [];
  pararAudio();
  $("#reveal-sub").classList.add("hidden");
  $("#btn-share-desafio").classList.add("hidden");
  $("#desafio-stats").classList.add("hidden");
  $("#btn-ouvir").classList.add("hidden");

  // Remover o iframe da revelação de verdade — só esconder o card deixa o
  // vídeo do YouTube tocando em segundo plano.
  $("#reveal-card").classList.add("hidden");
  $("#guess-input").value = "";
  closeSuggestions();
  $("#guess-input").disabled = false;
  $("#btn-guess").disabled = false;
  $("#btn-skip").disabled = false;
  $("#btn-play-snippet").disabled = true;
  $("#play-btn-label").textContent = "Carregando...";

  renderAttempts();
  renderHistory();
  loadCurrentSongIntoPlayer();
}

function renderHistory() {
  const list = $("#history-list");
  list.innerHTML = "";
  state.history.forEach((entry) => {
    const row = document.createElement("div");
    let cls, tag, text;
    if (entry.type === "skip") {
      cls = "skipped"; tag = "Pulou"; text = "—";
    } else if (entry.type === "correct") {
      cls = "correct-guess"; tag = "Acertou"; text = entry.text;
    } else if (entry.sameArtist) {
      cls = "same-artist"; tag = "Artista"; text = entry.text;
    } else {
      cls = "wrong-guess"; tag = "Errou"; text = entry.text;
    }
    row.className = "history-row " + cls;
    row.innerHTML =
      `<span class="history-tag">${tag}</span>` +
      `<span class="history-text"></span>`;
    row.querySelector(".history-text").textContent = text;
    list.appendChild(row);
  });
}

// A fita de tempo: as marcas ficam na posição proporcional de cada etapa
// dentro dos 15s totais, então a escala é honesta — 2s ocupa mesmo 13% dela.
const MAX_DURATION = ATTEMPT_DURATIONS[ATTEMPT_DURATIONS.length - 1];

function renderAttempts() {
  const track = $("#tape-track");
  const scale = $("#tape-scale");

  track.querySelectorAll(".tape-tick").forEach((t) => t.remove());
  ATTEMPT_DURATIONS.slice(0, -1).forEach((dur) => {
    const tick = document.createElement("span");
    tick.className = "tape-tick";
    tick.style.left = (dur / MAX_DURATION) * 100 + "%";
    track.appendChild(tick);
  });

  scale.innerHTML = "";
  ATTEMPT_DURATIONS.forEach((dur, i) => {
    const seg = document.createElement("span");
    seg.style.left = (dur / MAX_DURATION) * 100 + "%";
    seg.textContent = dur + "s";
    if (i < state.attemptIndex) seg.className = "done";
    if (i === state.attemptIndex && !state.finished) seg.className = "now";
    scale.appendChild(seg);
  });

  const current = ATTEMPT_DURATIONS[Math.min(state.attemptIndex, ATTEMPT_DURATIONS.length - 1)];
  $("#tape-unlocked").style.width = (current / MAX_DURATION) * 100 + "%";
  $("#current-duration").textContent = current;
}

// O áudio é a prévia de 30s da própria música, servida como arquivo. Não há
// player externo nem anúncio, então toda a antiga preparação mutada saiu: o
// trecho começa no instante do clique.
function loadCurrentSongIntoPlayer() {
  const audio = state.audio;
  clearTimeout(state.playTimer);

  audio.pause();
  audio.src = state.currentSong.previewUrl;
  audio.currentTime = 0;
  audio.load();

  state.ready = false;
  $("#btn-play-snippet").disabled = true;
  $("#play-btn-label").textContent = "Carregando...";
}

function marcarPronto() {
  state.ready = true;
  $("#btn-play-snippet").disabled = state.finished;
  $("#play-btn-label").textContent = "Tocar trecho";
}

function playSnippet() {
  if (state.playing) return;

  const audio = state.audio;
  const duration = ATTEMPT_DURATIONS[Math.min(state.attemptIndex, ATTEMPT_DURATIONS.length - 1)];
  const btn = $("#btn-play-snippet");
  const fill = $("#tape-fill");

  state.playing = true;
  btn.disabled = true;

  audio.currentTime = 0;
  audio.volume = 1;

  // play() devolve promessa: no celular ela é rejeitada se o navegador não
  // reconhecer um gesto do usuário. Como isto roda no clique do botão, o
  // caso normal passa — mas se falhar, o estado precisa voltar ao lugar.
  const p = audio.play();
  if (p && p.catch) {
    p.catch(() => {
      state.playing = false;
      btn.disabled = false;
      $("#play-btn-label").textContent = "Tocar trecho";
    });
  }

  const maxDuration = ATTEMPT_DURATIONS[ATTEMPT_DURATIONS.length - 1];
  fill.style.transition = "none";
  fill.style.width = "0%";
  requestAnimationFrame(() => {
    fill.style.transition = `width ${duration}s linear`;
    fill.style.width = (duration / maxDuration) * 100 + "%";
  });

  clearTimeout(state.playTimer);
  state.playTimer = setTimeout(() => {
    audio.pause();
    audio.currentTime = 0;
    state.playing = false;
    btn.disabled = state.finished;
  }, duration * 1000);
}

// Chamado quando a etapa avança (pular ou errar) COM o trecho ainda tocando:
// em vez de cortar no tempo antigo, deixa a música seguir direto até o tempo
// novo. Quem pula no meio do trecho de 5s ouve até os 10s sem clicar de novo.
function estenderTrecho() {
  if (!state.playing || state.finished) return;

  const audio = state.audio;
  const novoTotal = ATTEMPT_DURATIONS[Math.min(state.attemptIndex, ATTEMPT_DURATIONS.length - 1)];
  const restante = novoTotal - audio.currentTime;
  if (restante <= 0) return;

  const fill = $("#tape-fill");
  const maxDuration = ATTEMPT_DURATIONS[ATTEMPT_DURATIONS.length - 1];

  // Congela a barra onde ela está para o novo trecho continuar dali, sem salto.
  const larguraAtual = (audio.currentTime / maxDuration) * 100;
  fill.style.transition = "none";
  fill.style.width = larguraAtual + "%";
  requestAnimationFrame(() => {
    fill.style.transition = `width ${restante}s linear`;
    fill.style.width = (novoTotal / maxDuration) * 100 + "%";
  });

  clearTimeout(state.playTimer);
  state.playTimer = setTimeout(() => {
    audio.pause();
    audio.currentTime = 0;
    state.playing = false;
    $("#btn-play-snippet").disabled = state.finished;
  }, restante * 1000);
}

// Depois de revelar, deixa ouvir os 30s da prévia. A pessoa passou a rodada
// tentando reconhecer o trecho; ouvir a música é o fecho natural.
function ouvirMusica() {
  const audio = state.audio;
  const btn = $("#btn-ouvir");
  if (!audio) return;

  if (!audio.paused) {
    audio.pause();
    audio.currentTime = 0;
    btn.textContent = "Ouvir a música";
    return;
  }

  clearTimeout(state.playTimer); // senão o corte do trecho interromperia
  audio.currentTime = 0;
  audio.volume = 1;
  const p = audio.play();
  if (p && p.catch) p.catch(() => { btn.textContent = "Ouvir a música"; });
  btn.textContent = "Parar";
}

function pararAudio() {
  clearTimeout(state.playTimer);
  if (state.audio) {
    state.audio.pause();
    state.audio.currentTime = 0;
  }
  state.playing = false;
}

function handleGuess(guessRaw) {
  if (state.finished) return;
  if (!guessRaw || !guessRaw.trim()) return;

  const guessedSong = findSongByGuess(guessRaw);
  // Vale acerto também quando é a mesma gravação sob outro crédito.
  const isCorrect =
    !!guessedSong &&
    (guessedSong.id === state.currentSong.id || mesmaMusica(guessedSong, state.currentSong));
  const sameArtist =
    !isCorrect && !!guessedSong && shareArtist(guessedSong.artist, state.currentSong.artist);

  const entryText = guessedSong ? `${guessedSong.title} - ${guessedSong.artist}` : guessRaw.trim();

  if (isCorrect) {
    state.history.push({ type: "correct", text: entryText });
    state.solved = true;
    state.finished = true;
    state.streak += 1;
    if (state.streak > state.bestStreak) state.bestStreak = state.streak;
    persistStats();
    renderHistory();
    finishRound(true);
    return;
  }

  const input = $("#guess-input");
  input.classList.add("shake");
  setTimeout(() => input.classList.remove("shake"), 350);

  state.history.push({ type: "wrong", text: entryText, sameArtist });
  state.attemptIndex += 1;

  if (state.attemptIndex >= ATTEMPT_DURATIONS.length) {
    state.finished = true;
    state.streak = 0;
    persistStats();
    renderHistory();
    finishRound(false);
    return;
  }

  renderAttempts();
  renderHistory();
  estenderTrecho();
  salvarProgressoDiaria();
  $("#guess-input").value = "";
}

function handleSkip() {
  if (state.finished) return;
  state.history.push({ type: "skip" });
  state.attemptIndex += 1;
  if (state.attemptIndex >= ATTEMPT_DURATIONS.length) {
    state.finished = true;
    state.streak = 0;
    persistStats();
    renderHistory();
    finishRound(false);
    return;
  }
  renderAttempts();
  renderHistory();
  estenderTrecho();
  salvarProgressoDiaria();
}

function persistStats() {
  localStorage.setItem("qem_streak", state.streak);
  localStorage.setItem("qem_best_streak", state.bestStreak);
  updateStatsUI();
}

function recordRound(won) {
  const st = state.stats;
  st.rounds += 1;

  const g = state.genre;
  if (g) {
    st.byGenre[g] = st.byGenre[g] || { rounds: 0, wins: 0 };
    st.byGenre[g].rounds += 1;
  }

  if (won) {
    st.wins += 1;
    // attemptIndex ainda aponta para a etapa em que o acerto aconteceu
    const stage = Math.min(state.attemptIndex, ATTEMPT_DURATIONS.length - 1);
    st.byStage[stage] += 1;
    const semFiltro = !state.hitsOnly && state.genre !== TOP_GENRE_ID && state.genre !== DAILY_ID;
    st.points += Math.round(STAGE_POINTS[stage] * (semFiltro ? BONUS_CATALOGO : 1));
    if (g) st.byGenre[g].wins += 1;
  }

  localStorage.setItem("qem_stats", JSON.stringify(st));

  const etapa = Math.min(state.attemptIndex, ATTEMPT_DURATIONS.length - 1);

  if (state.genre === DAILY_ID) salvarProgressoDiaria();

  if (state.desafio) {
    const d = state.desafio;
    d.feitas += 1;
    if (won) {
      d.acertos += 1;
      d.pontos += STAGE_POINTS[etapa];
      d.byStage[etapa] += 1;
    } else {
      d.falhas += 1;
    }
  }

  renderStatsPanel();
}

function finishRound(won) {
  recordRound(won);
  renderAttempts();
  $("#guess-input").disabled = true;
  $("#btn-guess").disabled = true;
  $("#btn-skip").disabled = true;
  $("#btn-play-snippet").disabled = true;

  pararAudio();
  const song = state.currentSong;
  $("#reveal-label").textContent = won ? "Você acertou" : "A música era";
  $("#reveal-text").textContent = `${song.title} — ${song.artist}`;

  const d = state.desafio;
  const btn = $("#btn-next-song");
  if (d) {
    btn.textContent = d.feitas >= d.total
      ? "Ver resultado"
      : `Próxima · ${d.feitas + 1} de ${d.total}`;
  } else if (state.genre === DAILY_ID) {
    btn.textContent = "Voltar";
  } else {
    btn.textContent = "Próxima música";
  }

  $("#btn-ouvir").textContent = "Ouvir a música";
  $("#btn-ouvir").classList.remove("hidden");
  $("#reveal-card").classList.remove("hidden");
}

function voltarParaMenu() {
  pararAudio();
  document.body.classList.remove("mostrando-resultado");
  $("#screen-game").classList.add("hidden");
  $("#screen-genres").classList.remove("hidden");
  document.body.classList.remove("in-game");
  state.desafio = null;
  renderDailyCard();
  renderGenreGrid();
}

function lerRecordes() {
  try { return JSON.parse(localStorage.getItem("qem_desafios")) || {}; } catch { return {}; }
}

// Média de trechos gastos nos acertos: quanto menor, mais rápido reconheceu.
function mediaTrechos(byStage) {
  let soma = 0, n = 0;
  byStage.forEach((q, i) => { soma += q * (i + 1); n += q; });
  return n ? soma / n : 0;
}

function mostrarResultadoDesafio() {
  const d = state.desafio;
  pararAudio();
  // O placar é a tela inteira: player, campo de chute e histórico da última
  // música não têm mais função aqui e só competiriam com o resultado.
  document.body.classList.add("mostrando-resultado");

  const recordes = lerRecordes();
  const anterior = recordes[d.id] || null;
  const media = mediaTrechos(d.byStage);

  $("#reveal-label").textContent = "Desafio concluído";
  $("#reveal-text").textContent = `${d.acertos} de ${d.total}`;
  $("#reveal-sub").textContent = rotuloDesafio(d.id);
  $("#reveal-sub").classList.remove("hidden");

  const maior = Math.max(1, ...d.byStage, d.falhas);
  let linhas = "";
  ATTEMPT_DURATIONS.forEach((dur, i) => {
    const n = d.byStage[i];
    linhas +=
      `<div class="dist-row">` +
        `<span class="dist-label">${dur}s</span>` +
        `<span class="dist-bar"><span class="dist-fill" style="width:${(n / maior) * 100}%"></span></span>` +
        `<span class="dist-count">${n}</span>` +
      `</div>`;
  });
  linhas +=
    `<div class="dist-row">` +
      `<span class="dist-label">—</span>` +
      `<span class="dist-bar"><span class="dist-fill falhou" style="width:${(d.falhas / maior) * 100}%"></span></span>` +
      `<span class="dist-count">${d.falhas}</span>` +
    `</div>`;

  // A comparação é com o próprio histórico: não há outras pessoas jogando
  // este placar, então inventar média alheia seria mentira.
  const comparacao = anterior
    ? `Você já tinha feito ${anterior.acertos} de ${anterior.total} aqui.`
    : "Este desafio fica marcado como jogado — são sempre as mesmas 10 músicas.";

  $("#desafio-stats").innerHTML =
    `<div class="stats-grid">` +
      `<div class="stat-cell"><b>${d.pontos}</b><span>pontos</span></div>` +
      `<div class="stat-cell"><b>${media ? media.toFixed(1) : "—"}</b><span>trechos por acerto</span></div>` +
    `</div>` +
    `<p class="stats-label">Acertos por trecho</p>` +
    `<div class="dist">${linhas}</div>` +
    `<p class="rank-next">${comparacao}</p>`;
  $("#desafio-stats").classList.remove("hidden");

  // Grava sempre, não só quando melhora: é o registro de que o desafio foi
  // jogado, e é ele que impede a repetição.
  recordes[d.id] = { acertos: d.acertos, total: d.total, pontos: d.pontos, dia: diaDeHoje() };
  localStorage.setItem("qem_desafios", JSON.stringify(recordes));

  $("#btn-next-song").textContent = "Voltar";
  $("#btn-ouvir").classList.add("hidden");
  $("#btn-share-desafio").classList.remove("hidden");
  $("#btn-share-desafio").onclick = () => {
    const barras = ATTEMPT_DURATIONS
      .map((dur, i) => (d.byStage[i] ? `${dur}s×${d.byStage[i]}` : null))
      .filter(Boolean).join("  ");
    const texto = `Qual é a Música — ${rotuloDesafio(d.id)}\n` +
      `${d.acertos}/${d.total} · ${d.pontos} pts\n` +
      (barras ? barras + "\n" : "") +
      `${location.origin}${location.pathname}`;
    const b = $("#btn-share-desafio");
    navigator.clipboard.writeText(texto).then(
      () => { b.textContent = "Copiado!"; setTimeout(() => (b.textContent = "Compartilhar"), 1800); },
      () => { b.textContent = "Não deu para copiar"; setTimeout(() => (b.textContent = "Compartilhar"), 1800); }
    );
  };
  state.desafio = { ...d, encerrado: true };
}

// ---------- áudio ----------

function criarAudio() {
  const audio = new Audio();
  audio.preload = "auto";
  state.audio = audio;

  // canplaythrough pode não disparar em alguns navegadores; canplay basta
  // para um arquivo de 30s, então os dois liberam o botão.
  audio.addEventListener("canplaythrough", marcarPronto);
  audio.addEventListener("canplay", marcarPronto);

  // a prévia terminou sozinha: devolve o rótulo do botão
  audio.addEventListener("ended", () => {
    const b = $("#btn-ouvir");
    if (b) b.textContent = "Ouvir a música";
  });

  audio.addEventListener("error", () => {
    // Prévia fora do ar: não trava a partida, pula para a próxima música.
    if (!state.currentSong) return;
    console.warn("prévia indisponível:", state.currentSong.title);
    $("#play-btn-label").textContent = "Indisponível";
    setTimeout(() => { if (!state.finished) nextSong(); }, 1200);
  });
}

// ---------- wiring ----------

document.addEventListener("DOMContentLoaded", () => {
  criarAudio();
  renderDailyCard();
  renderGenreGrid();
  renderStatsPanel();
  updateStatsUI();

  document.querySelectorAll(".aba").forEach((aba) => {
    aba.addEventListener("click", () => {
      const alvo = aba.dataset.aba;
      document.querySelectorAll(".aba").forEach((x) => {
        const ativa = x === aba;
        x.classList.toggle("ativa", ativa);
        x.setAttribute("aria-selected", String(ativa));
      });
      document.querySelectorAll(".painel").forEach((pn) => {
        pn.classList.toggle("hidden", pn.id !== "painel-" + alvo);
      });
      localStorage.setItem("qem_aba", alvo);
    });
  });

  // volta na aba em que a pessoa estava
  const abaSalva = localStorage.getItem("qem_aba");
  if (abaSalva) {
    const alvo = document.querySelector('.aba[data-aba="' + abaSalva + '"]');
    if (alvo) alvo.click();
  }

  $("#btn-hits").addEventListener("click", () => {
    state.hitsOnly = !state.hitsOnly;
    localStorage.setItem("qem_hits_only", state.hitsOnly ? "1" : "0");
    $("#btn-hits").setAttribute("aria-pressed", String(state.hitsOnly));
    renderGenreGrid(); // as contagens mudam junto
  });

  $("#btn-reset-stats").addEventListener("click", () => {
    if (!confirm("Zerar todas as estatísticas, patente e recorde? Não dá para desfazer.")) return;
    state.stats = emptyStats();
    state.streak = 0;
    state.bestStreak = 0;
    localStorage.removeItem("qem_stats");
    persistStats();
    renderStatsPanel();
  });

  $("#btn-change-genre").addEventListener("click", voltarParaMenu);

  $("#btn-play-snippet").addEventListener("click", playSnippet);

  $("#guess-form").addEventListener("submit", (e) => {
    e.preventDefault();
    closeSuggestions();
    handleGuess($("#guess-input").value);
  });

  const guessInput = $("#guess-input");
  guessInput.addEventListener("input", () => renderSuggestions(guessInput.value));
  guessInput.addEventListener("blur", () => closeSuggestions());
  guessInput.addEventListener("keydown", (e) => {
    const box = $("#suggestions-box");
    const hasOpenSuggestions = !box.classList.contains("hidden");
    if (!hasOpenSuggestions) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveSuggestionActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSuggestionActive(-1);
    } else if (e.key === "Escape") {
      closeSuggestions();
    } else if (e.key === "Enter" && activeSuggestionIndex >= 0) {
      e.preventDefault();
      selectSuggestion(currentSuggestionMatches[activeSuggestionIndex]);
    }
  });

  $("#btn-ouvir").addEventListener("click", ouvirMusica);
  $("#btn-skip").addEventListener("click", handleSkip);

  $("#btn-next-song").addEventListener("click", () => {
    const d = state.desafio;
    if (d && d.encerrado) return voltarParaMenu();
    if (d && d.feitas >= d.total) return mostrarResultadoDesafio();
    if (state.genre === DAILY_ID) return voltarParaMenu();
    nextSong();
  });
});
