// Marincast: Marin Listings, a 2009 cable-box guide. One iframe at a time.
(function () {
  "use strict";

  var TOWNS = ["Mill Valley", "Sausalito", "San Rafael", "San Anselmo", "Fairfax", "Ross",
    "Larkspur", "Corte Madera", "Novato", "Tiburon", "West Marin"];
  var CODES = { "Mill Valley": "MV", "Sausalito": "SAUS", "San Rafael": "SR", "San Anselmo": "SA",
    "Fairfax": "FFX", "Kentfield": "KENT", "Ross": "ROSS", "Larkspur": "LARK", "Corte Madera": "CM", "Novato": "NOV",
    "Tiburon": "TIB", "West Marin": "WEST" };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var SPLITS = [60, 35, 50, 45, 65, 40, 55];

  var source = (Array.isArray(window.PLACES) && window.PLACES.length) ? window.PLACES
    : (Array.isArray(window.SEED_PLACES) ? window.SEED_PLACES : []);
  var places = source.filter(function (p) { return p && p.id && p.embedSrc && p.status !== "rejected"; });

  var $ = function (id) { return document.getElementById(id); };
  var screen = $("screen"), grid = $("grid"), preview = $("preview"), banner = $("banner");
  var cut = $("cut"), notice = $("notice");
  var keypads = document.querySelectorAll(".keypad");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var phoneMQ = window.matchMedia("(max-width: 719px)");
  function isPhone() { return phoneMQ.matches; }

  // first-visit hint, hidden once the visitor has tuned in
  try { if (localStorage.getItem("rt-tuned-once") === "1") document.documentElement.classList.add("hint-seen"); } catch (e) {}
  function hintSeen() {
    document.documentElement.classList.add("hint-seen");
    try { localStorage.setItem("rt-tuned-once", "1"); } catch (e) {}
  }

  var state = { i: 0, col: 0, tuned: false, look: false };
  var rows = [];
  var frame = null, frameSrc = "";
  var swapTimer = 0, bannerTimer = 0, busy = false;

  // ---------- helpers ----------

  function hash(str, seed) {
    var h = seed || 2166136261;
    for (var k = 0; k < str.length; k++) { h ^= str.charCodeAt(k); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function chNum(i) { var n = i + 2; return n < 10 ? "0" + n : String(n); }
  function code(p) { return CODES[p.town] || (p.town || "").slice(0, 4).toUpperCase(); }
  function gag(p) {
    var g = p && p.gag;
    return g && (g.type === "locked" || g.type === "unlisted") ? g : null;
  }
  // a real 2005-2011 photo, when a channel has one and it loaded
  var photoBad = {};
  function photoFor(p) {
    var ph = p && p.photo;
    return ph && typeof ph.src === "string" && ph.src && !photoBad[p.id] ? ph : null;
  }
  function taped(p) {
    var ph = state.col === 0 && photoFor(p);
    var m = /^(\d{4})-(\d{1,2})/.exec((ph && ph.taken) || p.captureDate || "");
    return m ? MONTHS[parseInt(m[2], 10) - 1] + " " + m[1] : "2008";
  }
  function clockTime() {
    var d = new Date(), h = d.getHours(), m = d.getMinutes();
    return (h % 12 || 12) + ":" + (m < 10 ? "0" : "") + m + (h < 12 ? "am" : "pm");
  }
  function today() {
    var d = new Date();
    return MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
  }
  function cur() { return places[state.i]; }
  function linkFor(id) { return location.origin + location.pathname + "#" + id; }
  // shareable link: a per-channel page with link-preview tags that redirects to /#id
  function shareURL(id) { return "https://marincast.com/ch/" + encodeURIComponent(id) + "/"; }
  // share the current channel: native sheet on phones, else copy. done(true|false|"shared")
  function shareCurrent(done) {
    var p = cur(), url = shareURL(p.id);
    if (isPhone() && navigator.share) {
      navigator.share({ title: "Marincast", text: curly(p.headline || p.name || ""), url: url })
        .then(function () { done("shared"); }, function (e) { if (e && e.name === "AbortError") done("cancel"); else copyText(url, done); });
      return;
    }
    copyText(url, done);
  }
  function copyText(url, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { done(true); }, function () { done(fallbackCopy(url)); });
    } else done(fallbackCopy(url));
  }
  function srcFor(p, col) { return col === 1 && p.nowEmbedSrc ? p.nowEmbedSrc : p.embedSrc; }

  // ---------- sound ----------

  var muted = false, actx = null, gestured = false;
  try { muted = localStorage.getItem("rt-muted") === "1"; } catch (e) {}

  function blip(freq, len) {
    if (muted || !gestured) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      var t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(freq || 1180, t);
      o.frequency.exponentialRampToValueAtTime((freq || 1180) * 0.78, t + (len || 0.06));
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (len || 0.06));
      o.connect(g); g.connect(actx.destination);
      o.start(t); o.stop(t + (len || 0.06) + 0.02);
    } catch (e) {}
  }
  ["pointerdown", "keydown", "touchstart"].forEach(function (ev) {
    window.addEventListener(ev, function () { gestured = true; }, { capture: true, passive: true });
  });

  // ---------- build grid ----------

  var groupOf = {}, ng = 0;
  places.forEach(function (p) { if (!(p.town in groupOf)) groupOf[p.town] = (ng++) % 3; });

  function buildRow(p, i) {
    var r = el("div", "row g" + groupOf[p.town]);
    r.setAttribute("role", "option");
    r.id = "row-" + p.id;
    r.style.setProperty("--split", SPLITS[hash(p.id) % SPLITS.length]);
    var g = gag(p);

    var ch = el("div", "cell ch");
    var lab = el("span", "lab", chNum(i) + " " + (g && g.type === "unlisted" ? "----" : code(p)));
    if (g && g.type === "locked") lab.appendChild(el("i", "lock"));
    ch.appendChild(lab);
    if (p.status === "placeholder") ch.appendChild(el("small", null, "(test)"));
    var a = el("div", "cell then"); a.appendChild(el("span", null, p.then || p.name || ""));
    var b = el("div", "cell now"); b.appendChild(el("span", null, p.now || ""));
    var hl = el("div", "cell hl"); hl.appendChild(el("span", null, curly(p.headline || p.name || "")));
    r.appendChild(ch); r.appendChild(a); r.appendChild(b); r.appendChild(hl);

    function pick(col) {
      return function (e) {
        e.stopPropagation();
        stopIdle();
        if (isPhone()) { state.i = i; state.col = 0; render(); tuneIn(); return; }
        if (state.i === i && state.col === col) { tuneIn(); return; }
        select(i, col, true);
      };
    }
    ch.addEventListener("click", function (e) { pick(state.i === i ? state.col : 0)(e); });
    a.addEventListener("click", pick(0));
    b.addEventListener("click", pick(1));
    hl.addEventListener("click", pick(0));
    return r;
  }

  // straight quotes to curly ones; no truncation anywhere
  function curly(t) {
    return String(t || "")
      .replace(/(^|[\s(\[{\u2014\u2013-])"/g, "$1\u201c")
      .replace(/"/g, "\u201d")
      .replace(/'(?=\d\ds\b)/g, "\u2019")
      .replace(/(^|[\s(\[{\u2014\u2013-])'/g, "$1\u2018")
      .replace(/'/g, "\u2019");
  }
  function firstSentence(t) {
    if (!t) return "";
    var m = /^[\s\S]*?[.!?]["\u201d']?(?=\s|$)/.exec(String(t).trim());
    return m ? m[0] : String(t).trim();
  }

  // compact banner (CH line + headline) or full (with THEN / NOW and story), per session
  var compact = false;
  try { compact = sessionStorage.getItem("rt-compact") === "1"; } catch (e) {}
  function setCompact(c) {
    compact = c;
    banner.classList.toggle("compact", c);
    scheduleFit();
    $("binfo").setAttribute("aria-pressed", c ? "false" : "true");
    try { sessionStorage.setItem("rt-compact", c ? "1" : "0"); } catch (e) {}
  }

  // ---------- fit text: nothing scrolls on desktop, shrink type until it fits ----------

  var fitRaf = 0;
  function scheduleFit() {
    cancelAnimationFrame(fitRaf);
    fitRaf = requestAnimationFrame(fitAll);
  }
  function overflows(box) { return box.scrollHeight > box.clientHeight + 1; }
  // shrink el's font-size from its CSS size down to min (px) until box stops overflowing
  function shrink(box, elx, min, start) {
    elx.style.fontSize = start ? start + "px" : "";
    if (!overflows(box)) return true;
    var size = start || parseFloat(getComputedStyle(elx).fontSize);
    while (overflows(box) && size > min) {
      size = Math.max(min, size - 0.5);
      elx.style.fontSize = size + "px";
    }
    return !overflows(box);
  }
  function fitAll() {
    var bin = $("bin"), info = document.querySelector(".info");
    var els = [$("bstory"), $("btitle"), $("dek"), $("title")];
    if (isPhone()) {
      els.forEach(function (x) { x.style.fontSize = ""; });
      bin.classList.remove("tight");
      return;
    }
    if (state.tuned) {
      bin.classList.remove("tight");
      $("btitle").style.fontSize = "";
      // start the story large (fills the panel like a real info screen), then shrink to fit
      var sw = screen.clientWidth || 900;
      var story = $("bstory"), startPx = Math.max(14, Math.min(26, sw * 0.023));
      story.style.fontSize = "";
      if (!shrink(bin, story, 12, startPx)) {
        if (!shrink(bin, $("btitle"), 15)) {
          bin.classList.add("tight");        // last resort: drop the THEN / NOW strip
          shrink(bin, story, 12, startPx);
        }
      }
    } else if (info) {
      $("title").style.fontSize = "";
      if (!shrink(info, $("dek"), 11)) shrink(info, $("title"), 15);
    }
  }
  if (window.ResizeObserver) {
    var fitRO = new ResizeObserver(scheduleFit);
    fitRO.observe(screen);
  }
  window.addEventListener("resize", scheduleFit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleFit);

  // ---------- selection ----------

  function render() {
    var p = cur(), g = gag(p);
    rows.forEach(function (r, k) {
      var on = k === state.i;
      r.classList.toggle("sel", on);
      r.classList.toggle("col1", on && state.col === 1);
      r.setAttribute("aria-selected", on ? "true" : "false");
    });
    $("title").textContent = curly(p.headline || p.name || "");
    $("chline").textContent = "CH " + chNum(state.i) + " " + (g && g.type === "unlisted" ? "----" : code(p));
    var t = $("taped");
    t.textContent = state.col === 1 ? "Now" : "Taped " + taped(p);
    if (state.col === 1 && !p.nowEmbedSrc) t.appendChild(el("span", "nocur", "no current view"));
    $("dek").textContent = curly(p.dek || firstSentence(p.story) || p.name || "");
    updateClock();

    $("bch").textContent = "CH " + chNum(state.i) + " " + (p.town || "").toUpperCase() +
      " · " + (state.col === 1 ? "Now" : "Taped " + taped(p));
    $("tbch").textContent = "CH " + chNum(state.i) + " " + (g && g.type === "unlisted" ? "----" : code(p));
    $("btitle").textContent = curly(p.headline || p.name || "");
    $("bthen").textContent = p.then || "";
    $("bnow").textContent = p.now || "";
    $("bstory").textContent = curly(p.story || "");
    $("bchan").textContent = chNum(state.i) + " " + (g && g.type === "unlisted" ? "----" : code(p));
    $("blk").hidden = !(g && g.type === "locked");
    $("bwhen").textContent = state.col === 1 ? "Now \u00b7 " + today() : "Taped " + taped(p);
    scheduleFit();
    $("bthen").parentNode.classList.toggle("on", state.col === 0);
    $("bnow").parentNode.classList.toggle("on", state.col === 1);
    $("f2008").setAttribute("aria-pressed", state.col === 0 ? "true" : "false");
    $("fnow").setAttribute("aria-pressed", state.col === 1 ? "true" : "false");
  }

  function updateClock() {
    var p = cur();
    if (!p) return;
    $("clock").textContent = (state.col === 1 ? today() : taped(p)) + " · " + clockTime();
  }

  function keepInView() {
    var r = rows[state.i];
    if (!r) return;
    var top = r.offsetTop - grid.offsetTop, bottom = top + r.offsetHeight;
    if (top < grid.scrollTop) grid.scrollTop = top;
    else if (bottom > grid.scrollTop + grid.clientHeight) grid.scrollTop = bottom - grid.clientHeight;
  }

  function select(i, col, sound) {
    i = (i + places.length) % places.length;
    var changed = i !== state.i || col !== state.col;
    state.i = i; state.col = col;
    render();
    keepInView();
    if (sound && changed) blip();
    clearTimeout(swapTimer);
    if (isPhone() && !state.tuned) return;   // phone guide has no preview window
    swapTimer = setTimeout(function () { setFrame(srcFor(cur(), state.col)); }, 250);
  }

  // ---------- the picture: a still (Street View Static) or the one live iframe ----------

  var SV_KEY = (typeof window.SV_KEY === "string") ? window.SV_KEY.trim() : "";
  var stillFails = 0, stillBad = {};
  function stillsOn() { return !!SV_KEY && stillFails < 3; }
  if (SV_KEY) document.documentElement.classList.add("stills");

  // pano id, heading, pitch, zoom out of an embed URL
  function parseEmbed(src) {
    var g = function (re) { var m = re.exec(src || ""); return m ? m[1] : null; };
    var pano = g(/!1s([^!]+)/);
    if (!pano) return null;
    var zoom = parseFloat(g(/!5f([-\d.]+)/));
    var fov = isFinite(zoom) ? Math.round(180 / Math.pow(2, zoom)) : 90;
    return {
      pano: pano,
      heading: parseFloat(g(/!3f([-\d.]+)/)) || 0,
      pitch: parseFloat(g(/!4f([-\d.]+)/)) || 0,
      fov: Math.max(10, Math.min(120, fov))
    };
  }
  // ask for the box's own aspect so nothing (including Google's mark) gets cropped
  function stillSize() {
    var w = preview.clientWidth || 640, h = preview.clientHeight || 480;
    var sh = Math.round(640 * h / w / 20) * 20;
    return "640x" + Math.max(160, Math.min(640, sh));
  }
  function stillURL(src, size) {
    var v = parseEmbed(src);
    if (!v) return null;
    size = size || stillSize();
    // keep the vertical framing of a 4:3 shot, widen horizontally for wide boxes,
    // so a sign framed in the embed stays in frame in a short, wide picture
    var wh = size.split("x"), aspect = (+wh[0]) / (+wh[1]);
    var rad = Math.PI / 180, vfov = v.fov * 0.75;
    var fov = Math.round(2 * Math.atan(Math.tan(vfov / 2 * rad) * aspect) / rad);
    fov = Math.max(10, Math.min(120, fov));
    // per-channel pitch override: the embed's !4f does not map 1:1 to the Static API
    var p = cur(), pitch = v.pitch, ov = null;
    if (p && src === p.embedSrc) ov = p.stillPitch;
    else if (p && src === p.nowEmbedSrc) ov = p.nowStillPitch;
    if (typeof ov === "number" && isFinite(ov)) pitch = ov;
    return "https://maps.googleapis.com/maps/api/streetview?size=" + size +
      "&pano=" + encodeURIComponent(v.pano) + "&heading=" + v.heading + "&pitch=" + pitch +
      "&fov=" + fov + "&return_error_code=true&key=" + encodeURIComponent(SV_KEY);
  }
  function preloadOther() {
    if (!state.tuned) return;
    var p = cur();
    if (state.col === 1 && photoFor(p)) { var ip = new Image(); ip.src = photoFor(p).src; return; }
    if (!stillsOn()) return;
    var other = state.col ? p.embedSrc : p.nowEmbedSrc;
    if (!other || stillBad[other]) return;
    var u = stillURL(other);
    if (u) { var im = new Image(); im.referrerPolicy = "no-referrer-when-downgrade"; im.src = u; }
  }

  var credit = null;
  function setCredit(ph) {
    if (credit) { credit.remove(); credit = null; }
    preview.classList.toggle("has-photo", !!ph);
    if (!ph) return;
    credit = el("div", "credit");
    credit.appendChild(document.createTextNode("Photo: "));
    var a = el("a", null, ph.author || "source");
    if (ph.page) { a.href = ph.page; a.target = "_blank"; a.rel = "noopener"; } else a = el("span", null, ph.author || "");
    credit.appendChild(a);
    if (ph.license) {
      credit.appendChild(document.createTextNode(" \u00b7 "));
      var l = el(ph.licenseUrl ? "a" : "span", null, ph.license);
      if (ph.licenseUrl) { l.href = ph.licenseUrl; l.target = "_blank"; l.rel = "noopener license"; }
      credit.appendChild(l);
    }
    credit.addEventListener("click", function (e) { e.stopPropagation(); });
    preview.appendChild(credit);
  }

  function setFrame(src) {
    var p = cur();
    // 2008 view: a real photo beats the Street View still
    var ph = !state.look && src === p.embedSrc && photoFor(p);
    if (ph) {
      var pkey = "photo|" + ph.src;
      if (pkey === frameSrc && frame) return;
      if (frame) { frame.onerror = null; frame.onload = null; frame.src = "about:blank"; frame.remove(); }
      preview.classList.remove("loaded");
      frame = document.createElement("img");
      frame.className = "still photo";
      frame.alt = (p.name || p.town || p.id) + (ph.taken ? ", " + ph.taken : "");
      frame.decoding = "async";
      frame.onload = function () { preview.classList.add("loaded"); };
      frame.onerror = function () {
        photoBad[p.id] = true;
        frameSrc = "";
        setCredit(null);
        render();
        setFrame(src);
      };
      frame.src = ph.src;
      preview.appendChild(frame);
      frameSrc = pkey;
      setCredit(ph);
      preloadOther();
      return;
    }
    setCredit(null);
    var still = stillsOn() && !state.look && !stillBad[src] && stillURL(src);
    var key = still ? "img|" + still : "ifr|" + src;
    if (key === frameSrc && frame) return;
    if (frame) { frame.onerror = null; frame.onload = null; frame.src = "about:blank"; frame.remove(); }
    preview.classList.remove("loaded");
    if (still) {
      frame = document.createElement("img");
      frame.className = "still";
      frame.alt = "Street View: " + (p.name || p.town || p.id);
      frame.decoding = "async";
      frame.referrerPolicy = "no-referrer-when-downgrade";
      frame.onload = function () { preview.classList.add("loaded"); };
      frame.onerror = function () {
        // key missing, quota, no imagery: fall back to the live embed
        stillFails++;
        stillBad[src] = true;
        frameSrc = "";
        setFrame(src);
      };
      frame.src = still;
      preview.appendChild(frame);
      frameSrc = key;
      preloadOther();
      return;
    }
    frame = document.createElement("iframe");
    frame.src = src;
    frame.title = "Street View: " + (p.name || p.town || p.id);
    frame.setAttribute("allowfullscreen", "");
    frame.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
    frame.setAttribute("tabindex", "-1");
    frame.onload = function () { setTimeout(function () { preview.classList.add("loaded"); }, 1200); };
    preview.appendChild(frame);
    frameSrc = key;
  }

  function setLook(on) {
    state.look = !!on;
    var b = $("blook");
    if (b) b.setAttribute("aria-pressed", state.look ? "true" : "false");
  }

  function clearFrame() {
    setCredit(null);
    if (frame) { frame.onerror = null; frame.onload = null; frame.src = "about:blank"; frame.remove(); }
    frame = null; frameSrc = "";
    preview.classList.remove("loaded");
  }

  // ---------- static transition ----------

  // white-noise burst, same length as the static on screen
  function hiss(ms) {
    if (muted || !gestured) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      var len = Math.max(0.05, ms / 1000), n = Math.floor(actx.sampleRate * len);
      var buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
      for (var k = 0; k < n; k++) d[k] = Math.random() * 2 - 1;
      var src = actx.createBufferSource(), g = actx.createGain(), f = actx.createBiquadFilter();
      f.type = "lowpass"; f.frequency.value = 6500;
      var t = actx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.01);
      g.gain.setValueAtTime(0.07, t + len * 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      src.buffer = buf;
      src.connect(f); f.connect(g); g.connect(actx.destination);
      src.start(t); src.stop(t + len + 0.02);
    } catch (e) {}
  }

  var pending = null; // the transition in progress, so a new one can finish it early

  // Static over the screen panel, then whatever change comes up. The canvas
  // exists only during the transition and is removed before the picture shows.
  function cutTo(fn, ms, snap) {
    if (pending) pending.finish(true);
    ms = ms || 220;
    if (reduced.matches) {
      cut.hidden = false;
      setTimeout(function () { fn(); cut.hidden = true; }, 120);
      return;
    }
    var rect = screen.getBoundingClientRect();
    var cw = Math.max(16, Math.round(rect.width / 3)), ch = Math.max(12, Math.round(rect.height / 3));
    var cv = document.createElement("canvas");
    cv.className = "static";
    cv.width = cw; cv.height = ch;
    screen.appendChild(cv);
    var ctx = cv.getContext("2d"), img = ctx.createImageData(cw, ch), px = img.data;
    var start = performance.now(), raf = 0, done = false;
    var bands = [Math.random() * ch, Math.random() * ch];

    function draw(now) {
      var t = (now - start) / 1000;
      var b0 = (bands[0] + t * ch * 1.6) % ch, b1 = (bands[1] + t * ch * 0.9) % ch;
      for (var y = 0, o = 0; y < ch; y++) {
        var lift = (Math.abs(y - b0) < ch * 0.05 ? 38 : 0) + (Math.abs(y - b1) < ch * 0.03 ? 24 : 0);
        for (var x = 0; x < cw; x++, o += 4) {
          var r = Math.random(), v;
          if (r < 0.34) v = 0; else if (r < 0.66) v = 255; else v = (r * 383) & 255;
          v = Math.min(255, v + lift);
          px[o] = px[o + 1] = px[o + 2] = v; px[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      raf = requestAnimationFrame(draw);
    }
    draw(start);
    hiss(ms);

    function finish(early) {
      if (done) return;
      done = true;
      pending = null;
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      fn();
      cv.remove();
      if (snap && !early && preview.animate) {
        var snapAnim = preview.animate([
          { transform: "scaleY(0.012)", background: "#f4f4f4" },
          { transform: "scaleY(1)" }
        ], { duration: 80, easing: "cubic-bezier(.3,.7,.4,1)" });
        // never leave the picture squashed if the timeline stalls (background tab)
        setTimeout(function () { try { snapAnim.cancel(); } catch (e) {} }, 160);
      }
    }
    var timer = setTimeout(finish, ms);
    pending = { finish: finish };
  }

  // ---------- tune in / out ----------

  var tunedI = -1, lastI = -1;
  function noteTuned(i) {
    if (tunedI !== -1 && tunedI !== i) lastI = tunedI;
    tunedI = i;
  }

  function showBanner() {
    if (!state.tuned) return;
    banner.classList.add("up");
    clearTimeout(bannerTimer);
    // banner stays up: hiding it only left an empty slab under the picture
  }

  function tuneIn(noCut) {
    if (busy) return;
    stopIdle();
    var p = cur(), g = gag(p);
    clearTimeout(swapTimer);
    blip(760, 0.09);
    var h = "#" + p.id;
    if (location.hash !== h) history.replaceState(null, "", h);

    function enter() {
      setLook(false);
      hintSeen();
      if (isPhone()) window.scrollTo(0, 0);
      noteTuned(state.i);
      state.tuned = true;
      screen.classList.add("tuned");
      setFrame(srcFor(p, state.col));
      banner.classList.remove("up");
      // let the banner slide up from the bottom
      setTimeout(showBanner, 30);
      scheduleFit();
    }

    if (g && g.type === "locked" && !p._seenLock) {
      p._seenLock = true;
      busy = true;
      clearFrame();
      $("noticeText").textContent = g.text || "This channel is not part of your package.";
      notice.hidden = false;
      setTimeout(function () {
        notice.hidden = true;
        busy = false;
        cutTo(enter, 350, true);
      }, 1800);
      return;
    }
    if (noCut) enter(); else cutTo(enter, 350, true);
  }

  function toGuide() {
    if (!state.tuned) return;
    state.tuned = false;
    setLook(false);
    clearTimeout(bannerTimer);
    banner.classList.remove("up");
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    cutTo(function () {
      screen.classList.remove("tuned");
      keepInView();
      scheduleFit();
      if (isPhone()) {
        clearFrame();
        var r = rows[state.i];
        if (r) r.scrollIntoView({ block: "center" });
      } else {
        // the guide preview is a different shape: ask for a still that fits it
        setFrame(srcFor(cur(), state.col));
      }
    }, 350);
    blip(980);
    resetIdle();
  }

  function flip(col) {
    if (col === state.col) return;
    var p = cur();
    state.col = col;
    setLook(false);
    blip(col ? 1320 : 900);
    if (state.tuned) {
      cutTo(function () { render(); setFrame(srcFor(p, col)); });
      showBanner();
    } else {
      select(state.i, col, false);
    }
  }

  function channel(delta) {
    var i = (state.i + delta + places.length) % places.length;
    if (state.tuned) {
      var p = places[i];
      if (gag(p) && gag(p).type === "locked" && !p._seenLock) {
        state.i = i; state.col = 0; render(); keepInView();
        tuneIn();
        return;
      }
      state.i = i; state.col = 0;
      setLook(false);
      noteTuned(i);
      blip();
      cutTo(function () {
        render(); keepInView();
        setFrame(srcFor(p, 0));
        history.replaceState(null, "", "#" + p.id);
      });
      showBanner();
    } else {
      select(i, state.col, true);
    }
  }

  // ---------- keypad ----------

  var digits = "", keyTimer = 0, msgTimer = 0;
  function showKeypad(text, msg) {
    keypads.forEach(function (k) { k.textContent = text; k.classList.toggle("msg", !!msg); });
  }
  function keyDigit(d) {
    clearTimeout(msgTimer);
    digits = (digits + d).slice(-2);
    showKeypad(digits.split("").join(" "));
    clearTimeout(keyTimer);
    keyTimer = setTimeout(function () {
      var n = parseInt(digits, 10), i = n - 2;
      digits = "";
      if (i >= 0 && i < places.length) {
        showKeypad("");
        if (state.tuned) {
          channel(i - state.i);
        } else {
          select(i, 0, true);
          tuneIn();
        }
      } else {
        showKeypad("CH " + (n < 10 ? "0" + n : n) + " not available in your area", true);
        msgTimer = setTimeout(function () { showKeypad(""); }, 2000);
      }
    }, 1000);
  }

  // ---------- share / mute ----------

  function share(btn) {
    var label = btn.textContent;
    shareCurrent(function (ok) {
      if (ok === "cancel") return;
      btn.textContent = ok === "shared" ? "SHARED" : ok ? "COPIED" : "COPY FAILED";
      setTimeout(function () { btn.textContent = label; }, 1500);
    });
  }
  function fallbackCopy(text) {
    try {
      var t = document.createElement("textarea");
      t.value = text; t.setAttribute("readonly", "");
      t.style.position = "fixed"; t.style.left = "-9999px";
      document.body.appendChild(t); t.select();
      var ok = document.execCommand("copy");
      t.remove();
      return ok;
    } catch (e) { return false; }
  }
  function setMute(m) {
    muted = m;
    try { localStorage.setItem("rt-muted", m ? "1" : "0"); } catch (e) {}
  }

  // ---------- idle mode ----------

  var idleTimer = 0, idleAdvance = 0, idleRaf = 0, idle = false;
  function resetIdle() {
    stopIdle();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(startIdle, 25000);
  }
  function startIdle() {
    if (state.tuned || state.off || isPhone() || places.length < 2) return;
    idle = true;
    idleAdvance = setInterval(function () { select(state.i + 1, 0, false); }, 8000);
    if (!reduced.matches) {
      var acc = 0;
      (function step() {
        acc += 0.25;
        if (acc >= 1) {
          var max = grid.scrollHeight - grid.clientHeight;
          grid.scrollTop = grid.scrollTop >= max - 1 ? 0 : grid.scrollTop + Math.floor(acc);
          acc = acc % 1;
        }
        idleRaf = requestAnimationFrame(step);
      })();
    }
  }
  function stopIdle() {
    if (!idle) return;
    idle = false;
    clearInterval(idleAdvance);
    cancelAnimationFrame(idleRaf);
    keepInView();
  }
  ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"].forEach(function (ev) {
    window.addEventListener(ev, function () { if (!state.tuned) resetIdle(); }, { passive: true });
  });

  // ---------- unlisted flicker ----------

  function flicker() {
    places.forEach(function (p, k) {
      var g = gag(p);
      if (!g || g.type !== "unlisted") return;
      var r = rows[k];
      r.classList.add("blank");
      setTimeout(function () { r.classList.remove("blank"); }, 350 + (hash(p.id) % 300));
    });
  }


  // ---------- the clicker ----------

  var remote = $("remote"), ir = $("ir"), rmsg = $("rmsg"), led = document.querySelector(".led");
  var rmsgTimer = 0, volTimer = 0, sheetOpen = false;

  function remoteMsg(t) {
    rmsg.textContent = t;
    clearTimeout(rmsgTimer);
    rmsgTimer = setTimeout(function () { rmsg.textContent = ""; }, 1200);
  }
  function blinkIR() {
    ir.classList.remove("on");
    void ir.offsetWidth;
    ir.classList.add("on");
    setTimeout(function () { ir.classList.remove("on"); }, 140);
  }
  // volume / mute indicator lives in the guide chrome (keypad slot), never on the picture
  function showVol() {
    clearTimeout(volTimer);
    showKeypad(muted ? "MUTE" : "VOL ▮▮▮▮▮▮▮▮", true);
    volTimer = setTimeout(function () { showKeypad(""); }, 1500);
  }

  function goTo(i) {
    if (i < 0 || i >= places.length) return;
    if (state.tuned) channel(i - state.i);
    else { select(i, 0, true); tuneIn(); }
  }

  // standby screensaver: the logo drifts and bounces, changing colour on each bounce
  var saver = null, saverRaf = 0;
  var SAVER_COLORS = ["#d9524a", "#e9cf5a", "#6fb0ea"];
  function startSaver() {
    var panel = $("panel");
    if (!panel || saver) return;
    saver = el("div", "saver");
    saver.setAttribute("aria-hidden", "true");
    var logo = el("div", "saver-logo");
    logo.innerHTML = '<svg viewBox="0 0 22 40" aria-hidden="true"><path d="M20 2A18 18 0 0 0 20 38A20.23 20.23 0 0 1 20 2Z" fill="currentColor"/></svg><span>marincast</span>';
    saver.appendChild(logo);
    panel.appendChild(saver);
    var ci = 0;
    logo.style.color = SAVER_COLORS[ci];
    if (reduced.matches) { saver.classList.add("still"); return; }
    var x = 20, y = 20, vx = 2.3, vy = 1.8, last = performance.now();
    (function step(now) {
      if (!saver) return;
      var dt = Math.min(48, now - last) / 16.7; last = now;
      var W = saver.clientWidth - logo.offsetWidth, H = saver.clientHeight - logo.offsetHeight;
      x += vx * dt; y += vy * dt;
      var hit = false;
      if (x <= 0) { x = 0; vx = Math.abs(vx); hit = true; }
      if (x >= W) { x = Math.max(0, W); vx = -Math.abs(vx); hit = true; }
      if (y <= 0) { y = 0; vy = Math.abs(vy); hit = true; }
      if (y >= H) { y = Math.max(0, H); vy = -Math.abs(vy); hit = true; }
      if (hit) { ci = (ci + 1) % SAVER_COLORS.length; logo.style.color = SAVER_COLORS[ci]; }
      logo.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)";
      saverRaf = requestAnimationFrame(step);
    })(last);
  }
  function stopSaver() {
    cancelAnimationFrame(saverRaf);
    if (saver) { saver.remove(); saver = null; }
  }

  function power() {
    var on = !state.off;
    if (on) {
      state.off = true;
      stopIdle(); clearTimeout(idleTimer); clearTimeout(swapTimer);
      if (pending) pending.finish(true);
      showKeypad("");
      led.classList.add("standby");
      var done = function () {
        if (!state.off) return;
        clearFrame();
        screen.hidden = true;
        startSaver();
      };
      if (!reduced.matches && screen.animate) {
        var a = screen.animate([
          { transform: "scale(1, 1)" },
          { transform: "scale(1, .006)", offset: .7 },
          { transform: "scale(0, .006)" }
        ], { duration: 260, easing: "ease-in" });
        a.onfinish = done;
        setTimeout(function () { if (!screen.hidden) done(); }, 400);
      } else done();
    } else {
      state.off = false;
      stopSaver();
      led.classList.remove("standby");
      state.tuned = false;
      screen.classList.remove("tuned");
      banner.classList.remove("up");
      notice.hidden = true; busy = false;
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
      screen.hidden = false;
      render(); keepInView();
      if (!isPhone()) setFrame(srcFor(cur(), state.col));
      if (!reduced.matches && screen.animate) {
        screen.animate([
          { transform: "scale(1, .006)" },
          { transform: "scale(1, 1)" }
        ], { duration: 160, easing: "cubic-bezier(.3,.7,.4,1)" });
      }
      hiss(220);
      resetIdle();
    }
  }

  var ACTS = {
    power: power,
    guide: function () { if (state.tuned) toGuide(); else { keepInView(); blip(980); } },
    info: function () {
      setCompact(!compact);
      if (state.tuned) showBanner();
      else { showKeypad(compact ? "INFO SHORT" : "INFO FULL", true); clearTimeout(volTimer); volTimer = setTimeout(function () { showKeypad(""); }, 1200); }
    },
    exit: function () { toGuide(); },
    look: function () {
      if (!state.tuned) { tuneIn(); return; }
      if (!stillsOn()) return;
      setLook(!state.look);
      cutTo(function () { setFrame(srcFor(cur(), state.col)); }, 220);
      showBanner();
    },
    up: function () { channel(-1); },
    down: function () { channel(1); },
    left: function () { flip(0); },
    right: function () { flip(1); },
    ok: function () { if (state.tuned) { setCompact(!compact); showBanner(); } else tuneIn(); },
    random: function () {
      if (places.length < 2) return;
      var i = state.i;
      while (i === state.i) i = Math.floor(Math.random() * places.length);
      goTo(i);
    },
    share: function () {
      shareCurrent(function (ok) { if (ok !== "cancel") remoteMsg(ok === "shared" ? "SHARED" : ok ? "COPIED" : "NO COPY"); });
    },
    last: function () { if (lastI >= 0) goTo(lastI); else remoteMsg("NO LAST"); },
    volup: function () { setMute(false); showVol(); blip(1200); },
    voldown: function () { setMute(true); showVol(); },
    chup: function () { channel(1); },
    chdown: function () { channel(-1); }
  };

  function press(e) {
    var b = e.target.closest("[data-act]");
    if (!b) return;
    var act = b.getAttribute("data-act");
    blinkIR();
    blip(1500, 0.035);
    if (state.off && act !== "power") return;
    stopIdle();
    if (act.charAt(0) === "d" && act.length === 2) { keyDigit(act.charAt(1)); return; }
    var fn = ACTS[act];
    if (fn) fn();
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("[data-act]")) press(e);
  });
  // instant pressed feedback, also for touch
  document.addEventListener("pointerdown", function (e) {
    var b = e.target.closest && e.target.closest("[data-act]");
    if (!b) return;
    b.classList.add("pressed");
    var up = function () { b.classList.remove("pressed"); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  });

  // phone: the remote is a bottom sheet
  var tab = $("remoteTab"), scrim = $("sheetScrim");
  function setSheet(open) {
    sheetOpen = open;
    remote.classList.toggle("open", open);
    scrim.hidden = !open;
    tab.setAttribute("aria-expanded", open ? "true" : "false");
  }
  tab.addEventListener("click", function () { setSheet(!sheetOpen); });
  scrim.addEventListener("click", function () { setSheet(false); });
  remote.querySelector(".grab").addEventListener("click", function () { setSheet(false); });

  // ---------- wiring ----------

  preview.addEventListener("click", function () { if (!state.tuned) tuneIn(); });
  $("bguide").addEventListener("click", toGuide);
  $("binfo").addEventListener("click", function (e) { e.stopPropagation(); setCompact(!compact); showBanner(); });
  $("bshare").addEventListener("click", function (e) { share(e.currentTarget); showBanner(); });
  $("f2008").addEventListener("click", function () { flip(0); });
  $("fnow").addEventListener("click", function () { flip(1); });
  banner.addEventListener("click", showBanner);
  banner.addEventListener("mousemove", showBanner);
  screen.addEventListener("mousemove", function () { if (state.tuned) showBanner(); });

  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Escape" && sheetOpen) { setSheet(false); return; }
    if (state.off) return;
    var tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    var k = e.key;
    if (/^[0-9]$/.test(k)) { keyDigit(k); e.preventDefault(); return; }
    if (k === "ArrowUp") { channel(-1); e.preventDefault(); }
    else if (k === "ArrowDown") { channel(1); e.preventDefault(); }
    else if (k === "ArrowLeft") { flip(0); e.preventDefault(); }
    else if (k === "ArrowRight") { flip(1); e.preventDefault(); }
    else if (k === "Enter" && !state.tuned && tag !== "BUTTON") { tuneIn(); e.preventDefault(); }
    else if (k === "Escape") { toGuide(); }
    else if ((k === "l" || k === "L") && state.tuned) { ACTS.look(); }
    else if ((k === "i" || k === "I") && state.tuned) { setCompact(!compact); showBanner(); }
  });

  function fromHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) { if (state.tuned) toGuide(); return; }
    for (var k = 0; k < places.length; k++) {
      if (places[k].id === id) {
        if (state.tuned && state.i === k) return;
        state.i = k; state.col = 0;
        render(); keepInView();
        tuneIn(true);
        return;
      }
    }
  }
  window.addEventListener("hashchange", fromHash);

  // ---------- go ----------

  if (!places.length) {
    grid.appendChild(el("p", "empty", "No listings yet."));
    return;
  }

  places.forEach(function (p, i) {
    var r = buildRow(p, i);
    rows.push(r);
    grid.appendChild(r);
  });
  setMute(muted);
  setCompact(compact);
  render();
  setInterval(updateClock, 15000);
  setInterval(flicker, 4200);

  if (location.hash.length > 1) fromHash();
  if (!state.tuned) { if (!isPhone()) setFrame(srcFor(cur(), 0)); resetIdle(); }
  // crossing the phone breakpoint: the desktop guide needs its preview back
  var onMQ = function () {
    if (!isPhone() && !state.tuned && !state.off && !frame) setFrame(srcFor(cur(), state.col));
    if (isPhone() && !state.tuned && frame) clearFrame();
  };
  if (phoneMQ.addEventListener) phoneMQ.addEventListener("change", onMQ); else if (phoneMQ.addListener) phoneMQ.addListener(onMQ);
})();
