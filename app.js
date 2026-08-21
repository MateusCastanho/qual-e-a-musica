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
};

// Cada gênero tem uma cor própria, que marca o card no lugar de um emoji.
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
};

const ATTEMPT_DURATIONS = [0.5, 2, 5, 10, 15]; // seconds

// Pontos por acerto, conforme o trecho que bastou. Acertar com meio segundo
// vale quase 7x acertar com 15s — é o que a patente premia.
const STAGE_POINTS = [100, 60, 40, 25, 15];

// Patentes por pontuação acumulada, da menor para a maior.
const RANKS = [
  { min: 0, name: "Ouvinte de Rádio" },
  { min: 300, name: "Fã de Carteirinha" },
  { min: 800, name: "DJ de Churrasco" },
  { min: 1800, name: "Cabeça de Fone" },
  { min: 3500, name: "Ouvido Absoluto" },
  { min: 6000, name: "Enciclopédia Musical" },
];

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
};

// ---------- utils ----------

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

  found = pool.find((s) => {
    const t = normalize(s.title);
    // t precisa de tamanho mínimo: título de 1-2 letras (ex.: "É") bateria
    // com qualquer chute que contenha essas letras.
    return guessNorm.length >= 3 && t.length >= 4 && (t.includes(guessNorm) || guessNorm.includes(t));
  });
  return found || null;
}

function updateStatsUI() {
  $("#streak").textContent = state.streak;
  $("#best-streak").textContent = state.bestStreak;
}

// ---------- genre screen ----------

function songsByGenre(genreId) {
  if (genreId === TOP_GENRE_ID) return SONGS.filter((s) => s.top);
  return SONGS.filter((s) => s.genre === genreId);
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

function renderGenreGrid() {
  const grid = $("#genre-grid");
  grid.innerHTML = "";
  Object.keys(GENRE_LABELS).forEach((genreId) => {
    const count = songsByGenre(genreId).length;
    const card = document.createElement("button");
    card.className = genreId === TOP_GENRE_ID ? "genre-card genre-card-featured" : "genre-card";
    card.disabled = count === 0;
    card.style.setProperty("--chip", GENRE_ACCENT[genreId]);
    card.innerHTML =
      `<span class="genre-name">${GENRE_LABELS[genreId]}</span>` +
      `<span class="genre-count"><b>${count}</b>músicas</span>`;
    card.addEventListener("click", () => startGenre(genreId));
    grid.appendChild(card);
  });
}

function startGenre(genreId) {
  state.genre = genreId;
  state.queue = shuffle(songsByGenre(genreId));
  $("#screen-genres").classList.add("hidden");
  $("#screen-game").classList.remove("hidden");
  document.body.classList.add("in-game");
  nextSong();
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
      const key = normalize(`${s.title} ${s.artist}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((s) => ({
      song: s,
      searchText: normalize(`${s.title} ${s.artist}`),
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

  const matches = getSuggestionPool()
    .filter((e) => e.searchText.includes(q))
    .sort((a, b) => {
      // título começando com a busca aparece primeiro
      const aStarts = a.titleNorm.startsWith(q) ? 0 : 1;
      const bStarts = b.titleNorm.startsWith(q) ? 0 : 1;
      return aStarts - bStarts;
    })
    .slice(0, 8);

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
  const isCorrect = !!guessedSong && guessedSong.id === state.currentSong.id;
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
    st.points += STAGE_POINTS[stage];
    if (g) st.byGenre[g].wins += 1;
  }

  localStorage.setItem("qem_stats", JSON.stringify(st));
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
  $("#reveal-card").classList.remove("hidden");
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
  renderGenreGrid();
  renderStatsPanel();
  updateStatsUI();

  $("#btn-reset-stats").addEventListener("click", () => {
    if (!confirm("Zerar todas as estatísticas, patente e recorde? Não dá para desfazer.")) return;
    state.stats = emptyStats();
    state.streak = 0;
    state.bestStreak = 0;
    localStorage.removeItem("qem_stats");
    persistStats();
    renderStatsPanel();
  });

  $("#btn-change-genre").addEventListener("click", () => {
    pararAudio();
    $("#screen-game").classList.add("hidden");
    $("#screen-genres").classList.remove("hidden");
    document.body.classList.remove("in-game");
  });

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

  $("#btn-skip").addEventListener("click", handleSkip);
  $("#btn-next-song").addEventListener("click", nextSong);
});
