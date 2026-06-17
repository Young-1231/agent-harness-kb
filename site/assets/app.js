/* =============================================================================
   Agent / Harness 知识库 — runtime (vanilla JS, zero dependencies)
   Features
     1. Theme toggle (dark default, persisted in localStorage)
     2. Mobile sidebar drawer (hamburger + scrim + Esc + focus return)
     3. TOC scrollspy (IntersectionObserver, highlights current h2/h3)
     4. Reading-progress bar
     5. Smooth-scroll for in-page anchors (respects reduced-motion)
     6. Back-to-top floating button (shows after scroll)
   All wiring is defensive: every feature no-ops if its DOM hook is absent,
   so the same script is safe on the home page and content pages alike.
   ========================================================================== */
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function ready(fn) {
    if (doc.readyState !== "loading") fn();
    else doc.addEventListener("DOMContentLoaded", fn);
  }

  /* ---------------------------------------------------------------------------
     1. THEME TOGGLE  (default: dark; stored under "ahkb-theme")
     ------------------------------------------------------------------------ */
  var THEME_KEY = "ahkb-theme";

  function applyTheme(theme) {
    if (theme === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme"); // dark is the default (no attr)
  }

  // apply as early as possible to avoid a flash
  try {
    applyTheme(localStorage.getItem(THEME_KEY) || "dark");
  } catch (e) { /* private mode / disabled storage */ }

  function initThemeToggle() {
    var btn = doc.querySelector("[data-theme-toggle]");
    if (!btn) return;
    btn.setAttribute('aria-pressed', String((root||document.documentElement).getAttribute('data-theme') === 'light'));
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
      btn.setAttribute("aria-pressed", String(next === "light"));
    });
  }

  /* ---------------------------------------------------------------------------
     2. MOBILE SIDEBAR DRAWER
     ------------------------------------------------------------------------ */
  function initDrawer() {
    var sidebar = doc.querySelector("[data-sidebar]");
    var toggle = doc.querySelector("[data-drawer-toggle]");
    var scrim = doc.querySelector("[data-scrim]");
    if (!sidebar || !toggle) return;

    var lastFocus = null;

    function open() {
      lastFocus = doc.activeElement;
      sidebar.classList.add("is-open");
      if (scrim) scrim.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      var firstLink = sidebar.querySelector("a, button");
      if (firstLink) firstLink.focus();
    }
    function close() {
      sidebar.classList.remove("is-open");
      if (scrim) scrim.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    }
    function isOpen() { return sidebar.classList.contains("is-open"); }

    toggle.addEventListener("click", function () { isOpen() ? close() : open(); });
    if (scrim) scrim.addEventListener("click", close);

    // close after navigating from a nav link (mobile only)
    sidebar.addEventListener("click", function (e) {
      if (e.target.closest("a") && window.matchMedia("(max-width: 860px)").matches) close();
    });

    doc.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen()) close();
    });

    // reset state if resized back to desktop
    window.addEventListener("resize", function () {
      if (!window.matchMedia("(max-width: 860px)").matches) close();
    });
  }

  /* ---------------------------------------------------------------------------
     3. TOC SCROLLSPY
     Observes every heading the TOC links to and marks the nearest one active.
     ------------------------------------------------------------------------ */
  function initScrollspy() {
    var toc = doc.querySelector("[data-toc]");
    if (!toc) return;
    var links = Array.prototype.slice.call(toc.querySelectorAll("a[href^='#']"));
    if (!links.length) return;

    var map = {}; // id -> { link, item }
    var targets = [];
    links.forEach(function (link) {
      var id = decodeURIComponent(link.getAttribute("href").slice(1));
      var el = id && doc.getElementById(id);
      if (!el) return;
      map[id] = { link: link, item: link.closest(".toc__item") || link };
      targets.push(el);
    });
    if (!targets.length) return;

    var current = null;
    function setActive(id) {
      if (id === current) return;
      current = id;
      links.forEach(function (l) {
        var item = l.closest(".toc__item") || l;
        item.classList.remove("is-active");
      });
      if (map[id]) {
        map[id].item.classList.add("is-active");
        // keep active item in view within the TOC rail
        var r = map[id].item.getBoundingClientRect();
        var pr = toc.getBoundingClientRect();
        if (r.top < pr.top || r.bottom > pr.bottom) {
          map[id].item.scrollIntoView({ block: "nearest" });
        }
      }
    }

    // Track which headings are above the fold line; pick the lowest visible one.
    var visible = {};
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var id = entry.target.id;
        if (entry.isIntersecting) visible[id] = entry.boundingClientRect.top;
        else delete visible[id];
      });
      var ids = Object.keys(visible);
      if (ids.length) {
        // topmost currently-visible heading
        ids.sort(function (a, b) { return visible[a] - visible[b]; });
        setActive(ids[0]);
      } else {
        // none in the band: choose the last heading scrolled past
        var passed = targets.filter(function (t) {
          return t.getBoundingClientRect().top < 120;
        });
        if (passed.length) setActive(passed[passed.length - 1].id);
      }
    }, { rootMargin: "-80px 0px -68% 0px", threshold: [0, 1] });

    targets.forEach(function (t) { observer.observe(t); });
  }

  /* ---------------------------------------------------------------------------
     4. READING PROGRESS BAR
     ------------------------------------------------------------------------ */
  function initProgress() {
    var bar = doc.querySelector("[data-progress]");
    if (!bar) return;
    var ticking = false;
    function update() {
      var h = doc.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      var pct = max > 0 ? (h.scrollTop || window.pageYOffset) / max : 0;
      bar.style.width = (Math.min(1, Math.max(0, pct)) * 100).toFixed(2) + "%";
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ---------------------------------------------------------------------------
     5. SMOOTH ANCHOR SCROLL  (also updates the URL hash)
     ------------------------------------------------------------------------ */
  function initSmoothAnchors() {
    doc.addEventListener("click", function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = decodeURIComponent(a.getAttribute("href").slice(1));
      if (!id) return;
      var el = doc.getElementById(id);
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      history.pushState(null, "", "#" + id);
      el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });
    });
  }

  /* ---------------------------------------------------------------------------
     6. BACK-TO-TOP BUTTON
     ------------------------------------------------------------------------ */
  function initBackToTop() {
    var btn = doc.querySelector("[data-to-top]");
    if (!btn) return;
    var ticking = false;
    function update() {
      btn.classList.toggle("is-visible", (window.pageYOffset || doc.documentElement.scrollTop) > 480);
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });
    update();
  }

  /* --------------------------------------------------------------------------- */
  ready(function () {
    initThemeToggle();
    initDrawer();
    initScrollspy();
    initProgress();
    initSmoothAnchors();
    initBackToTop();
  });
})();
