/* Bucks Haven Farm — site automations
   ──────────────────────────────────
   1. Aerial hero auto-swap  — drop assets/img/aerial-hero.jpg (or .mp4) on the
      server and the hero picks it up automatically; no code change needed.
   2. Photo drop-ins         — about.jpg / riding.jpg swap in the same way.
   3. Self-updating gallery  — reads api/gallery.php (folder listing).
   4. Sticky nav + scrollspy + mobile menu.
   5. Scroll-reveal animations (IntersectionObserver).
   6. Testimonial auto-rotator.
   7. Live "barn office" open/closed badge (hours configured below).
   8. Ajax tour-request form with honeypot + time-trap spam protection.
   9. Auto-updating footer year, back-to-top, gallery lightbox.
*/

(function () {
  "use strict";

  /* ── config ─────────────────────────────────────────── */
  const OFFICE_HOURS = { open: 8, close: 20 };            // 8am–8pm daily
  const HERO_IMAGE = "assets/img/aerial-hero.jpg";        // your drone photo
  const HERO_VIDEO = "assets/img/aerial-hero.mp4";        // or drone video
  const QUOTE_INTERVAL_MS = 6500;

  /* ── 1. aerial hero auto-swap ───────────────────────── */
  const heroMedia = document.getElementById("heroMedia");
  if (heroMedia) {
    // Prefer video if present, else photo, else keep the illustrated placeholder.
    fetch(HERO_VIDEO, { method: "HEAD" })
      .then((r) => {
        if (r.ok && (r.headers.get("content-type") || "").startsWith("video")) {
          const v = document.createElement("video");
          v.src = HERO_VIDEO;
          v.autoplay = v.muted = v.loop = v.playsInline = true;
          v.setAttribute("muted", "");
          heroMedia.style.animation = "none";
          heroMedia.replaceChildren(v);
        } else {
          tryHeroImage();
        }
      })
      .catch(tryHeroImage);

    function tryHeroImage() {
      const img = new Image();
      img.onload = () => {
        heroMedia.style.backgroundImage = `url("${HERO_IMAGE}")`;
      };
      img.src = HERO_IMAGE;
    }
  }

  /* ── 2. section photo drop-ins ──────────────────────── */
  [
    { sel: ".photo-card--about", src: "assets/img/about.jpg" },
    { sel: ".photo-card--riding", src: "assets/img/riding.jpg" },
  ].forEach(({ sel, src }) => {
    const card = document.querySelector(sel);
    if (!card) return;
    const img = new Image();
    img.onload = () => {
      img.alt = "";
      card.appendChild(img);
      card.classList.add("has-img");
    };
    img.src = src;
  });

  /* ── 3. self-updating gallery ───────────────────────── */
  const galleryGrid = document.getElementById("galleryGrid");
  if (galleryGrid) {
    fetch("api/gallery.php")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((files) => renderGallery(Array.isArray(files) ? files : []))
      .catch(() => renderGallery([]));
  }
  function renderGallery(files) {
    galleryGrid.replaceChildren();
    if (!files.length) {
      // graceful placeholder tiles until photos are uploaded
      for (let i = 0; i < 6; i++) {
        const tile = document.createElement("div");
        tile.className = "gallery__tile gallery__tile--empty";
        tile.innerHTML = "<span>✦</span>";
        galleryGrid.appendChild(tile);
      }
      return;
    }
    files.forEach((src) => {
      const tile = document.createElement("button");
      tile.className = "gallery__tile";
      tile.type = "button";
      tile.setAttribute("aria-label", "Enlarge photo");
      const img = new Image();
      img.loading = "lazy";
      img.src = src;
      img.alt = "Bucks Haven Farm";
      tile.appendChild(img);
      tile.addEventListener("click", () => openLightbox(src));
      galleryGrid.appendChild(tile);
    });
    observeReveals(galleryGrid.querySelectorAll(".gallery__tile"));
  }

  /* ── lightbox ───────────────────────────────────────── */
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  function openLightbox(src) {
    lightboxImg.src = src;
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeLightbox() {
    lightbox.hidden = true;
    lightboxImg.src = "";
    document.body.style.overflow = "";
  }
  document.getElementById("lightboxClose").addEventListener("click", closeLightbox);
  lightbox.addEventListener("click", (e) => { if (e.target === lightbox) closeLightbox(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !lightbox.hidden) closeLightbox(); });

  /* ── 4. nav: sticky, scrollspy, mobile ──────────────── */
  const nav = document.getElementById("nav");
  const navLinks = document.getElementById("navLinks");
  const burger = document.getElementById("navBurger");
  const toTop = document.getElementById("toTop");

  function onScroll() {
    const y = window.scrollY;
    nav.classList.toggle("is-scrolled", y > 40);
    toTop.classList.toggle("is-visible", y > 700);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  burger.addEventListener("click", () => {
    const open = navLinks.classList.toggle("is-open");
    burger.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", String(open));
  });
  navLinks.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      navLinks.classList.remove("is-open");
      burger.classList.remove("is-open");
      burger.setAttribute("aria-expanded", "false");
    })
  );

  // scrollspy
  const spyTargets = [...document.querySelectorAll("section[id]")];
  const spyLinks = new Map(
    [...navLinks.querySelectorAll("a:not(.btn)")].map((a) => [a.getAttribute("href").slice(1), a])
  );
  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        const link = spyLinks.get(e.target.id);
        if (link && e.isIntersecting) {
          spyLinks.forEach((l) => l.classList.remove("is-active"));
          link.classList.add("is-active");
        }
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  spyTargets.forEach((s) => spy.observe(s));

  toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  /* ── 5. scroll-reveal ───────────────────────────────── */
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          revealObserver.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  function observeReveals(nodes) {
    nodes.forEach((n) => {
      n.classList.add("reveal");
      revealObserver.observe(n);
    });
  }
  document.querySelectorAll(".reveal").forEach((n) => revealObserver.observe(n));

  /* ── 6. testimonial rotator ─────────────────────────── */
  const quotes = [...document.querySelectorAll("#quotes .quote")];
  const dotsWrap = document.getElementById("quoteDots");
  if (quotes.length && dotsWrap) {
    let idx = 0, timer;
    quotes.forEach((_, i) => {
      const b = document.createElement("button");
      b.setAttribute("aria-label", "Show testimonial " + (i + 1));
      b.addEventListener("click", () => { show(i); restart(); });
      dotsWrap.appendChild(b);
    });
    const dots = [...dotsWrap.children];
    function show(i) {
      idx = i;
      quotes.forEach((q, j) => q.classList.toggle("is-active", j === i));
      dots.forEach((d, j) => d.classList.toggle("is-active", j === i));
    }
    function restart() {
      clearInterval(timer);
      timer = setInterval(() => show((idx + 1) % quotes.length), QUOTE_INTERVAL_MS);
    }
    show(0);
    restart();
  }

  /* ── 7. live office status badge ────────────────────── */
  const statusEl = document.getElementById("officeStatus");
  if (statusEl) {
    const update = () => {
      const h = new Date().getHours();
      const open = h >= OFFICE_HOURS.open && h < OFFICE_HOURS.close;
      statusEl.innerHTML = open
        ? '<span class="dot dot--open"></span>Barn office is open — call (301) 440-7800'
        : '<span class="dot dot--closed"></span>Barn office is closed — send a tour request below';
      statusEl.hidden = false;
    };
    update();
    setInterval(update, 60 * 1000);
  }

  /* ── 8. ajax tour form ──────────────────────────────── */
  const form = document.getElementById("tourForm");
  const formStatus = document.getElementById("formStatus");
  const formTs = document.getElementById("formTs");
  if (form) {
    const loadedAt = Date.now();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      formTs.value = String(Date.now() - loadedAt); // ms spent on page (spam time-trap)
      formStatus.className = "form__status";
      formStatus.textContent = "Sending…";
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        const res = await fetch(form.action, { method: "POST", body: new FormData(form) });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          formStatus.classList.add("ok");
          formStatus.textContent = "Thank you! We received your request and will be in touch shortly.";
          form.reset();
        } else {
          throw new Error(data.error || "Something went wrong.");
        }
      } catch (err) {
        formStatus.classList.add("err");
        formStatus.textContent =
          "We couldn't send your message — please call (301) 440-7800 or try again.";
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* ── 9. footer year ─────────────────────────────────── */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
