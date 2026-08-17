const APP = document.getElementById("app");
const CONTENT_BASE = "content/";
const PROGRESS_KEY = "tsuki.progress.v1";

// estado/utilidades
const cache = { library: null, manga: {} };

function loadProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; }
  catch { return {}; }
}
function saveProgress(p) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch {}
}
function setProgress(mangaId, data) {
  const p = loadProgress();
  p[mangaId] = Object.assign({}, p[mangaId], data, { ts: Date.now() });
  saveProgress(p);
}
function getProgress(mangaId) { return loadProgress()[mangaId] || null; }

//ajustes
const SETTINGS_KEY = "tsuki.settings.v1";
const FONTS = {
  system:  { label: "Sistema",            stack: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif' },
  rounded: { label: "Redondeada",         stack: 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, sans-serif' },
  serif:   { label: "Serif",              stack: 'ui-serif, Georgia, "Times New Roman", serif' },
  zen:     { label: "Gotica (Zen Kaku)",  stack: '"Zen Kaku Gothic New", system-ui, sans-serif' },
};
const SIZES = {
  s:  { label: "Pequeno",     scale: 0.9 },
  m:  { label: "Mediano",     scale: 1 },
  l:  { label: "Grande",      scale: 1.12 },
  xl: { label: "Muy grande",  scale: 1.26 },
};
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; }
}
function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}
function applyAppearance() {
  const s = loadSettings();
  const f = FONTS[s.font] || FONTS.system;
  const sz = SIZES[s.size] || SIZES.m;
  document.documentElement.style.setProperty("--ui", f.stack);
  document.documentElement.style.setProperty("--ui-scale", sz.scale);
}
applyAppearance();

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`);
  return res.json();
}
async function getLibrary() {
  if (!cache.library) cache.library = await fetchJSON(CONTENT_BASE + "library.json");
  return cache.library;
}
async function getManga(id) {
  if (!cache.manga[id]) cache.manga[id] = await fetchJSON(`${CONTENT_BASE}${id}/manifest.json`);
  return cache.manga[id];
}

const basename = (p) => p.split("/").pop();
const naturalCmp = (a, b) =>
  basename(a).localeCompare(basename(b), undefined, { numeric: true, sensitivity: "base" });

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v != null) n.setAttribute(k, v);
  }
  for (const kid of kids) {
    if (kid == null) continue;
    n.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
  }
  return n;
}

const ICONS = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
};

/* estado de la estanteria (busqueda + filtro), persistente en navegacion */
const shelfFilters = { q: "", filter: "todos" };
const FILTER_LABELS = [["todos", "Todos"], ["reading", "En curso"], ["finished", "Finalizado"], ["paused", "Pausado"]];

function normalize(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function seriesState(m, prog) {
  if (!prog) return "unread";
  if (prog.paused) return "paused";
  const last = m.chapters - 1;
  const readLast = prog.read && prog.read[last];
  if (readLast || (prog.chapter ?? 0) > last) return "finished";
  return "reading";
}

const IMG_RE = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;

async function loadCBZ(url, onProgress) {
  if (typeof JSZip === "undefined") throw new Error("Falta JSZip (vendor/jszip.min.js)");

  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`No se pudo descargar el capitulo (${res.status})`);

  const len = +res.headers.get("Content-Length") || 0;
  let buf;
  if (res.body && len > 0) {
    const reader = res.body.getReader();
    const chunks = []; let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); received += value.length;
      onProgress && onProgress(received / len * 0.7, "descargando");
    }
    buf = await new Blob(chunks).arrayBuffer();
  } else {
    buf = await res.arrayBuffer();
  }

  onProgress && onProgress(0.72, "abriendo");
  const zip = await JSZip.loadAsync(buf);

  const entries = [];
  zip.forEach((path, file) => {
    if (file.dir) return;
    const base = basename(path);
    if (IMG_RE.test(base) && !base.startsWith(".") && !base.startsWith("__MACOSX")) {
      entries.push(file);
    }
  });
  if (!entries.length) throw new Error("El CBZ no contiene imagenes");
  entries.sort((a, b) => naturalCmp(a.name, b.name));

  const urls = [];
  for (let i = 0; i < entries.length; i++) {
    const blob = await entries[i].async("blob");
    urls.push(URL.createObjectURL(blob));
    onProgress && onProgress(0.72 + (i + 1) / entries.length * 0.28, "abriendo");
  }
  return urls;
}

async function renderShelf() {
  const lib = await getLibrary();
  const progress = loadProgress();

  const view = el("div", { class: "view shelf-view" });

  // cabecera
  const search = el("input", {
    class: "search-input", type: "search", placeholder: "Buscar titulos\u2026",
    value: shelfFilters.q, "aria-label": "Buscar",
  });
  view.appendChild(el("header", { class: "header" },
    el("div", { class: "brand" },
      el("span", { class: "wordmark" }, "Tsuki"),
      el("span", { class: "brand-sub" }, "BIBLIOTECA")
    ),
    el("div", { class: "search" }, el("span", { class: "search-ic", html: ICONS.search }), search),
    el("a", { class: "avatar", href: "#/settings", html: ICONS.gear })
  ));

  if (!lib.manga.length) {
    view.appendChild(el("div", { class: "empty" },
      el("div", { class: "big" }, "Tu biblioteca esta vacia"),
      el("div", {}, "Agrega tus capitulos con build.py y vuelve a cargar.")
    ));
    return view;
  }

  // precalcular datos por serie
  const items = lib.manga.map((m) => {
    const prog = progress[m.id];
    return { m, prog, state: seriesState(m, prog) };
  });

  // continuar leyendo
  const contItems = [];
  const reading = items.filter((it) => it.state === "reading");
  const contSection = el("section", { class: "section continue-section" });
  if (reading.length) {
    contSection.appendChild(el("div", { class: "eyebrow" }, "Continuar leyendo"));
    const grid = el("div", { class: "continue-grid" });
    for (const { m, prog } of reading) {
      const chIdx = prog.chapter ?? 0;
      const chPages = prog.chPages || 1;
      const within = prog.page != null ? (prog.page + 1) / chPages : 0;
      const frac = Math.min(1, (chIdx + within) / m.chapters) * 100;
      const chLabel = prog.chTitle ? `Capitulo ${chIdx + 1}: ${prog.chTitle}` : `Capitulo ${chIdx + 1}`;
      const card = el("a", { class: "cont-card", href: `#/read/${m.id}/${chIdx}` },
        el("div", { class: "cont-cover" },
          m.cover ? el("img", { src: `${CONTENT_BASE}${m.cover}`, alt: m.title, loading: "lazy" }) : null
        ),
        el("div", { class: "cont-info" },
          el("div", { class: "cont-title" }, m.title),
          el("div", { class: "cont-chap" }, chLabel),
          el("div", { class: "cont-bar" }, el("span", { style: `width:${frac}%` })),
          el("span", { class: "cont-resume" }, el("span", { class: "ic", html: ICONS.play }), document.createTextNode("Reanudar"))
        )
      );
      card.dataset.title = normalize(m.title);
      contItems.push(card);
      grid.appendChild(card);
    }
    contSection.appendChild(grid);
  }
  view.appendChild(contSection);

  // colección completa
  const collItems = [];
  const collSection = el("section", { class: "section" });

  const tabs = el("div", { class: "tabs" });
  FILTER_LABELS.forEach(([key, label]) => {
    const t = el("button", { class: `tab ${shelfFilters.filter === key ? "active" : ""}` }, label);
    t.addEventListener("click", () => {
      shelfFilters.filter = key;
      tabs.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
      t.classList.add("active");
      applyFilters();
    });
    tabs.appendChild(t);
  });
  collSection.appendChild(el("div", { class: "section-head" },
    el("div", { class: "eyebrow" }, "Coleccion completa"),
    tabs
  ));

  const grid = el("div", { class: "shelf" });
  const dotClass = { reading: "ok", finished: "done", paused: "paused", unread: "none" };
  for (const { m, prog, state } of items) {
    const poster = el("div", { class: "poster" },
      m.cover ? el("img", { src: `${CONTENT_BASE}${m.cover}`, alt: m.title, loading: "lazy" }) : null,
      el("span", { class: `dot ${dotClass[state]}` })
    );
    if (prog) {
      const pct = Math.min(100, Math.round(((prog.chapter ?? 0) + 1) / m.chapters * 100));
      poster.appendChild(el("div", { class: "progress", style: `width:${pct}%` }));
    }
    const sub = prog ? `Cap. ${(prog.chapter ?? 0) + 1} de ${m.chapters}`
                     : `${m.chapters} capitulo${m.chapters === 1 ? "" : "s"}`;
    const link = el("a", { class: "poster-link", href: `#/manga/${m.id}` },
      poster,
      el("div", { class: "title" }, m.title),
      el("div", { class: "sub" }, sub)
    );
    link.dataset.title = normalize(m.title);
    link.dataset.state = state;
    collItems.push(link);
    grid.appendChild(link);
  }
  collSection.appendChild(grid);
  const collEmpty = el("div", { class: "coll-empty" }, "Nada por aqui.");
  collSection.appendChild(collEmpty);
  view.appendChild(collSection);

  /* ---------- filtrado ---------- */
  function applyFilters() {
    const q = normalize(shelfFilters.q.trim());
    let contVisible = 0;
    contItems.forEach((it) => {
      const show = !q || it.dataset.title.includes(q);
      it.style.display = show ? "" : "none";
      if (show) contVisible++;
    });
    contSection.style.display = contVisible ? "" : "none";

    let collVisible = 0;
    collItems.forEach((it) => {
      const okF = shelfFilters.filter === "todos" || it.dataset.state === shelfFilters.filter;
      const okQ = !q || it.dataset.title.includes(q);
      const show = okF && okQ;
      it.style.display = show ? "" : "none";
      if (show) collVisible++;
    });
    collEmpty.style.display = collVisible ? "none" : "";
  }

  search.addEventListener("input", () => { shelfFilters.q = search.value; applyFilters(); });
  applyFilters();
  return view;
}
function renderSettings() {
  const s0 = loadSettings();
  const curFont = s0.font || "system";
  const curSize = s0.size || "m";
  const view = el("div", { class: "view" });

  view.appendChild(el("div", { class: "topbar" },
    el("a", { class: "icon-btn", href: "#/", html: ICONS.back }),
    el("div", { class: "title" }, "Ajustes")
  ));

  view.appendChild(el("div", { class: "list-label" }, "Tipo de letra"));
  const fontList = el("div", {});
  for (const [key, f] of Object.entries(FONTS)) {
    const row = el("div", { class: `setting-row ${key === curFont ? "active" : ""}` },
      el("span", { class: "name", style: `font-family:${f.stack}` }, f.label),
      el("span", { class: "check" }, "\u2713")
    );
    row.addEventListener("click", () => {
      const s = loadSettings(); s.font = key; saveSettings(s);
      applyAppearance();
      route();
    });
    fontList.appendChild(row);
  }
  view.appendChild(fontList);

  view.appendChild(el("div", { class: "list-label" }, "Tamano de letra"));
  const sizeList = el("div", {});
  for (const [key, sz] of Object.entries(SIZES)) {
    const row = el("div", { class: `setting-row ${key === curSize ? "active" : ""}` },
      el("span", { class: "name", style: `font-size:${sz.scale}rem` }, sz.label),
      el("span", { class: "check" }, "\u2713")
    );
    row.addEventListener("click", () => {
      const s = loadSettings(); s.size = key; saveSettings(s);
      applyAppearance();
      route();
    });
    sizeList.appendChild(row);
  }
  view.appendChild(sizeList);

  return view;
}
async function renderChapters(id) {
  const m = await getManga(id);
  const prog = getProgress(id);
  const coverURL = m.cover ? `${CONTENT_BASE}${id}/${m.cover}` : "";

  const view = el("div", { class: "view" });

  const paused = prog && prog.paused;
  const pauseBtn = el("button", { class: "text-btn" }, paused ? "Reanudar serie" : "Pausar serie");
  pauseBtn.addEventListener("click", () => {
    setProgress(id, { paused: !paused });
    route();
  });
  view.appendChild(el("div", { class: "topbar" },
    el("a", { class: "icon-btn", href: "#/", html: ICONS.back }),
    el("div", { class: "title" }, m.title),
    pauseBtn
  ));

  view.appendChild(el("div", { class: "manga-hero" },
    el("div", { class: "poster" },
      coverURL ? el("img", { src: coverURL, alt: m.title }) : null
    ),
    el("div", { class: "info" },
      el("h2", {}, m.title),
      el("div", { class: "author" }, m.author || ""),
      el("p", { class: "synopsis" }, m.synopsis || "")
    )
  ));

  if (prog) {
    const ch = m.chapters[prog.chapter] || m.chapters[0];
    view.appendChild(el("a", { class: "continue", href: `#/read/${id}/${prog.chapter ?? 0}` },
      el("span", { class: "play", html: ICONS.play }),
      el("span", { class: "txt" },
        el("b", {}, "Continuar"), document.createTextNode("  "),
        el("span", {}, `${ch.title} \u00b7 pag. ${(prog.page ?? 0) + 1}`)
      )
    ));
  }

  view.appendChild(el("div", { class: "list-label" }, "Capitulos"));

  const readMap = (prog && prog.read) || {};
  const list = el("div", {});
  m.chapters.forEach((ch, i) => {
    const isRead = readMap[i] || (prog && prog.chapter > i);
    const isCurrent = prog && prog.chapter === i && !isRead;
    let mark = null;
    if (isCurrent) mark = el("span", { class: "mark reading" }, "Leyendo");
    else if (isRead) mark = el("span", { class: "mark" }, "\u2713");
    const pages = ch.pages != null ? `${ch.pages} paginas` : ".cbz";
    list.appendChild(el("a", { class: "chapter", href: `#/read/${id}/${i}` },
      el("span", { class: "num" }, String(i + 1)),
      el("span", { class: "ct" },
        el("span", { class: "name" }, ch.title),
        el("span", { class: "pages" }, pages)
      ),
      mark
    ));
  });
  view.appendChild(list);
  return view;
}

function renderReader(id, chapterIndex) {
  const reader = el("div", { class: "reader" });

  // pantalla de carga del capitulo
  const loadBar = el("span", {});
  const loadStatus = el("div", { class: "status" }, "descargando\u2026");
  reader.appendChild(el("div", { class: "cbz-loading" },
    el("div", { class: "spinner" }),
    loadStatus,
    el("div", { class: "bar" }, loadBar)
  ));

  let pageURLs = [];  // blob URLs, se liberan en el cleanup
  function revokeAll() { pageURLs.forEach((u) => URL.revokeObjectURL(u)); pageURLs = []; }

  (async () => {
    const m = await getManga(id);
    chapterIndex = Math.max(0, Math.min(chapterIndex, m.chapters.length - 1));
    const ch = m.chapters[chapterIndex];
    const dir = m.direction === "ltr" ? "ltr" : "rtl";
    const prog = getProgress(id);
    let mode = (prog && prog.mode) || "vertical";

    // descargar + descomprimir el CBZ
    const cbzURL = `${CONTENT_BASE}${id}/${ch.file}`;
    pageURLs = await loadCBZ(cbzURL, (p, phase) => {
      loadBar.style.width = `${Math.round(p * 100)}%`;
      loadStatus.textContent = phase === "abriendo" ? "abriendo\u2026" : "descargando\u2026";
    });

    const total = pageURLs.length;
    const pageURL = (i) => pageURLs[i];
    const resumePage = (prog && prog.chapter === chapterIndex)
      ? Math.min(prog.page || 0, total - 1) : 0;

    reader.innerHTML = "";

    const top = el("div", { class: "reader-chrome reader-top" },
      el("a", { class: "icon-btn", href: `#/manga/${id}`, html: ICONS.back }),
      el("div", { class: "rt-title" },
        el("div", { class: "name" }, m.title),
        el("div", { class: "sub" }, `${ch.title} \u00b7 cap. ${String(chapterIndex + 1).padStart(2, "0")}`)
      )
    );
    const readout = el("span", { class: "page-readout" }, `1 / ${total}`);
    const fill = el("span", { class: "fill" });
    const scrubber = el("div", { class: `scrubber ${dir === "rtl" ? "rtl" : ""}` }, fill);
    const btnVert = el("button", { class: mode === "vertical" ? "active" : "" }, "Vertical");
    const btnPaged = el("button", { class: mode === "paged" ? "active" : "" }, "Paginas");
    const toggle = el("div", { class: "seg" }, btnVert, btnPaged);
    const bottom = el("div", { class: "reader-chrome reader-bottom" }, readout, scrubber, toggle);

    const container = el("div", { class: "reader-pages" });
    reader.append(top, container, bottom);

    let pagedNav = null;

    function onKey(ev) {
      if (mode !== "paged" || !pagedNav) return;
      if (ev.key === "ArrowLeft") (dir === "rtl" ? pagedNav.next : pagedNav.prev)();
      else if (ev.key === "ArrowRight") (dir === "rtl" ? pagedNav.prev : pagedNav.next)();
    }
    window.addEventListener("keydown", onKey);
    window.__readerCleanup = () => { window.removeEventListener("keydown", onKey); revokeAll(); };

    const hasNext = chapterIndex + 1 < m.chapters.length;
    function markRead(i) {
      const p = getProgress(id) || {};
      const read = Object.assign({}, p.read, { [i]: true });
      setProgress(id, { read });
    }
    function goChapter(idx) {
      if (idx < 0 || idx >= m.chapters.length) return;
      location.hash = `#/read/${id}/${idx}`;
    }

    let chromeTimer;
    function setChrome(v) {
      top.classList.toggle("hidden", !v);
      bottom.classList.toggle("hidden", !v);
    }
    function showChromeAuto() { setChrome(true); clearTimeout(chromeTimer); chromeTimer = setTimeout(() => setChrome(false), 2800); }
    function toggleChrome() { const hidden = top.classList.contains("hidden"); clearTimeout(chromeTimer); setChrome(hidden); }
    function hideChrome() { clearTimeout(chromeTimer); setChrome(false); }
    function setReadout(curr) {
      readout.textContent = `${curr + 1} / ${total}`;
      fill.style.width = `${((curr + 1) / total) * 100}%`;
    }

    function mountVertical() {
      pagedNav = null;
      container.className = "reader-pages pages-vertical";
      container.innerHTML = "";
      const imgs = [];
      for (let i = 0; i < total; i++) {
        const img = el("img", { alt: `pagina ${i + 1}`, "data-idx": i, loading: "lazy", decoding: "async" });
        img.dataset.src = pageURL(i);
        imgs.push(img);
        container.appendChild(img);
      }

      // pie de fin de capitulo
      const end = el("div", { class: "chapter-end" },
        el("div", { class: "ce-title" }, "Fin del capitulo"),
        hasNext
          ? el("button", { class: "ce-btn", onclick: (e) => { e.stopPropagation(); markRead(chapterIndex); goChapter(chapterIndex + 1); } },
              "Siguiente capitulo", el("span", { html: " &rarr;" }))
          : el("div", { class: "ce-note" }, "No hay mas capitulos por ahora.")
      );
      container.appendChild(end);

      const loadObs = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.target.dataset.src) {
            e.target.src = e.target.dataset.src;
            delete e.target.dataset.src;
            loadObs.unobserve(e.target);
          }
        }
      }, { rootMargin: "1400px 0px" });
      imgs.forEach((img) => loadObs.observe(img));

      function currentPage() {
        const c = container.getBoundingClientRect();
        const probe = c.top + c.height * 0.45;
        let idx = 0;
        for (let i = 0; i < imgs.length; i++) {
          if (imgs[i].getBoundingClientRect().top <= probe) idx = i; else break;
        }
        return idx;
      }
      let ticking = false;
      container.onscroll = () => {
        hideChrome(); // al desplazar, la barra se quita
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const i = currentPage();
          setReadout(i);
          setProgress(id, { chapter: chapterIndex, page: i, mode: "vertical", chTitle: ch.title, chPages: total });
          if (i >= total - 1) markRead(chapterIndex);
          ticking = false;
        });
      };
      container.onclick = toggleChrome; // tocar muestra/oculta la barra

      requestAnimationFrame(() => {
        if (resumePage > 0 && imgs[resumePage]) {
          if (imgs[resumePage].dataset.src) imgs[resumePage].src = imgs[resumePage].dataset.src;
          imgs[resumePage].scrollIntoView();
        }
        setReadout(resumePage);
      });
    }

    let current = resumePage;
    function mountPaged() {
      container.className = "reader-pages pages-paged";
      container.innerHTML = "";
      const img = el("img", { alt: "pagina", decoding: "async" });
      const endScreen = el("div", { class: "chapter-end paged-end" },
        el("div", { class: "ce-title" }, "Fin del capitulo"),
        el("div", { class: "ce-actions" },
          el("button", { class: "ce-btn secondary", onclick: () => show(total - 1) }, "Volver"),
          hasNext
            ? el("button", { class: "ce-btn", onclick: () => { markRead(chapterIndex); goChapter(chapterIndex + 1); } },
                "Siguiente", el("span", { html: " &rarr;" }))
            : el("div", { class: "ce-note" }, "No hay mas capitulos.")
        )
      );
      endScreen.style.display = "none";
      const zones = el("div", { class: "tap-zones" },
        el("div", { class: "zone left" }),
        el("div", { class: "zone center" }),
        el("div", { class: "zone right" })
      );
      container.append(img, endScreen, zones);

      const seen = {};
      function preload(i) {
        if (i < 0 || i >= total || seen[i]) return;
        const p = new Image(); p.src = pageURL(i); seen[i] = p;
      }
      function render() {
        if (current >= total) {          // pantalla de fin
          img.style.display = "none";
          endScreen.style.display = "";
          zones.style.display = "none";
          readout.textContent = "Fin";
          fill.style.width = "100%";
          markRead(chapterIndex);
        } else {
          endScreen.style.display = "none";
          zones.style.display = "";
          img.style.display = "";
          img.src = pageURL(current);
          setReadout(current);
          setProgress(id, { chapter: chapterIndex, page: current, mode: "paged", chTitle: ch.title, chPages: total });
          if (current >= total - 1) markRead(chapterIndex);
          preload(current + 1); preload(current - 1);
        }
      }
      function show(i) { current = Math.max(0, Math.min(i, total)); render(); }
      function next() {
        if (current >= total) { if (hasNext) { markRead(chapterIndex); goChapter(chapterIndex + 1); } return; }
        show(current + 1);
      }
      function prev() { show(current - 1); }
      pagedNav = { next, prev };
      const onLeft = () => { dir === "rtl" ? next() : prev(); showChromeAuto(); };
      const onRight = () => { dir === "rtl" ? prev() : next(); showChromeAuto(); };
      zones.children[0].onclick = onLeft;
      zones.children[2].onclick = onRight;
      zones.children[1].onclick = toggleChrome;
      show(current);
    }

    function setMode(next) {
      mode = next;
      btnVert.classList.toggle("active", mode === "vertical");
      btnPaged.classList.toggle("active", mode === "paged");
      setProgress(id, { mode });
      mode === "vertical" ? mountVertical() : mountPaged();
      showChromeAuto();
    }
    btnVert.onclick = () => setMode("vertical");
    btnPaged.onclick = () => setMode("paged");

    setMode(mode);
  })().catch((err) => {
    revokeAll();
    reader.innerHTML = `<div class="placeholder-page">No se pudo abrir el capitulo.<br>${err.message}</div>`;
  });

  return reader;
}

async function route() {
  const hash = location.hash.slice(1) || "/";
  const parts = hash.split("/").filter(Boolean);

  if (window.__readerCleanup) { window.__readerCleanup(); window.__readerCleanup = null; }

  let view;
  try {
    if (parts[0] === "settings") {
      view = renderSettings();
    } else if (parts[0] === "manga" && parts[1]) {
      view = await renderChapters(decodeURIComponent(parts[1]));
    } else if (parts[0] === "read" && parts[1]) {
      view = renderReader(decodeURIComponent(parts[1]), parseInt(parts[2] || "0", 10));
    } else {
      view = await renderShelf();
    }
  } catch (err) {
    view = el("div", { class: "view" }, el("div", { class: "placeholder-page" }, `Error: ${err.message}`));
  }

  APP.innerHTML = "";
  APP.appendChild(view);
  if (parts[0] !== "read") window.scrollTo(0, 0);
}

window.addEventListener("hashchange", route);
route();
