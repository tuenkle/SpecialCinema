(function () {
  "use strict";

  const FORMAT_LABEL = {
    IMAX: "IMAX",
    ScreenX: "ScreenX",
    DolbyCinema: "Dolby Cinema",
  };
  const FORMAT_COLOR = {
    IMAX: "#0b7bd4",
    ScreenX: "#d62f3d",
    DolbyCinema: "#8b5cf6",
  };
  const CHAIN_BOOKING = {
    CGV: "http://www.cgv.co.kr/",
    메가박스: "https://www.megabox.co.kr/",
    롯데시네마: "https://www.lottecinema.co.kr/",
  };

  const state = {
    map: null,
    theaters: [],
    markers: new Map(), // theater.id -> { marker, el }
    activeFormats: new Set(["IMAX", "ScreenX", "DolbyCinema"]),
    selectedId: null,
  };

  // ---------- Naver Maps loader ----------
  function loadNaverMaps() {
    return new Promise((resolve, reject) => {
      const clientId = (window.NAVER_MAP_CLIENT_ID || "").trim();
      if (!clientId) {
        reject(new Error("NO_CLIENT_ID"));
        return;
      }
      const script = document.createElement("script");
      script.src =
        "https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=" +
        encodeURIComponent(clientId);
      script.onload = () => {
        if (window.naver && window.naver.maps) resolve();
        else reject(new Error("LOAD_FAILED"));
      };
      script.onerror = () => reject(new Error("LOAD_FAILED"));
      document.head.appendChild(script);
    });
  }

  async function loadTheaters() {
    const res = await fetch("data/theaters.json");
    if (!res.ok) throw new Error("데이터 로드 실패: " + res.status);
    return res.json();
  }

  // ---------- Filters ----------
  function theaterFormats(t) {
    return [...new Set(t.auditoriums.map((a) => a.format))];
  }

  function isVisible(t) {
    return theaterFormats(t).some((f) => state.activeFormats.has(f));
  }

  function updateCounts() {
    const counts = { IMAX: 0, ScreenX: 0, DolbyCinema: 0 };
    for (const t of state.theaters) {
      for (const f of theaterFormats(t)) counts[f]++;
    }
    for (const f of Object.keys(counts)) {
      const el = document.getElementById("count-" + f);
      if (el) el.textContent = counts[f];
    }
  }

  function applyFilters() {
    for (const t of state.theaters) {
      const entry = state.markers.get(t.id);
      if (!entry) continue;
      entry.marker.setMap(isVisible(t) ? state.map : null);
    }
    if (state.selectedId) {
      const sel = state.theaters.find((t) => t.id === state.selectedId);
      if (sel && !isVisible(sel)) closePanel();
    }
  }

  function initFilters() {
    document.querySelectorAll(".filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const format = btn.dataset.format;
        if (state.activeFormats.has(format)) {
          state.activeFormats.delete(format);
          btn.classList.remove("active");
        } else {
          state.activeFormats.add(format);
          btn.classList.add("active");
        }
        applyFilters();
      });
    });
  }

  // ---------- Markers ----------
  function markerHtml(t) {
    const dots = theaterFormats(t)
      .map(
        (f) =>
          '<span class="m-dot" style="background:' + FORMAT_COLOR[f] + '"></span>'
      )
      .join("");
    return '<div class="marker" data-id="' + t.id + '">' + dots + "</div>";
  }

  function createMarkers() {
    for (const t of state.theaters) {
      const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(t.lat, t.lng),
        map: state.map,
        title: t.name,
        icon: { content: markerHtml(t), anchor: new naver.maps.Point(0, 0) },
      });
      naver.maps.Event.addListener(marker, "click", () => selectTheater(t));
      state.markers.set(t.id, { marker });
    }
  }

  // ---------- Panel ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function specRow(label, value) {
    if (value === null || value === undefined || value === "") return "";
    return "<dt>" + esc(label) + "</dt><dd>" + esc(value) + "</dd>";
  }

  function audCard(a) {
    const rows =
      specRow("스크린", a.screen) +
      specRow("영사", a.projection) +
      specRow("사운드", a.sound) +
      specRow("좌석", a.seats != null ? a.seats + "석" : null);
    return (
      '<div class="aud-card f-' + a.format + '">' +
      '<div class="aud-head">' +
      '<span class="aud-badge">' + esc(FORMAT_LABEL[a.format]) + "</span>" +
      (a.name ? '<span class="aud-title">' + esc(a.name) + "</span>" : "") +
      "</div>" +
      (rows ? '<dl class="spec-grid">' + rows + "</dl>" : "") +
      (a.notes ? '<div class="aud-notes">' + esc(a.notes) + "</div>" : "") +
      "</div>"
    );
  }

  function selectTheater(t) {
    state.selectedId = t.id;

    document.querySelectorAll(".marker.selected").forEach((el) =>
      el.classList.remove("selected")
    );
    const markerEl = document.querySelector('.marker[data-id="' + t.id + '"]');
    if (markerEl) markerEl.classList.add("selected");

    const booking = CHAIN_BOOKING[t.chain];
    const naverSearch =
      "https://map.naver.com/p/search/" + encodeURIComponent(t.name);

    const visibleAuds = t.auditoriums.filter((a) =>
      state.activeFormats.has(a.format)
    );
    const audsToShow = visibleAuds.length ? visibleAuds : t.auditoriums;

    document.getElementById("panel-body").innerHTML =
      '<div class="theater-chain">' + esc(t.chain) + "</div>" +
      '<div class="theater-name">' + esc(t.name) + "</div>" +
      '<div class="theater-addr">' + esc(t.address) + "</div>" +
      '<div class="theater-links">' +
      (booking
        ? '<a href="' + booking + '" target="_blank" rel="noopener">예매하기</a>'
        : "") +
      '<a href="' + naverSearch + '" target="_blank" rel="noopener">네이버 지도에서 보기</a>' +
      "</div>" +
      '<div class="aud-list">' + audsToShow.map(audCard).join("") + "</div>";

    document.getElementById("panel").hidden = false;

    state.map.panTo(new naver.maps.LatLng(t.lat, t.lng));
  }

  function closePanel() {
    state.selectedId = null;
    document.getElementById("panel").hidden = true;
    document.querySelectorAll(".marker.selected").forEach((el) =>
      el.classList.remove("selected")
    );
  }

  // ---------- Init ----------
  async function init() {
    initFilters();
    document.getElementById("panel-close").addEventListener("click", closePanel);

    try {
      state.theaters = await loadTheaters();
    } catch (e) {
      console.error(e);
      return;
    }
    updateCounts();

    try {
      await loadNaverMaps();
    } catch (e) {
      document.getElementById("map-notice").hidden = false;
      return;
    }

    state.map = new naver.maps.Map("map", {
      center: new naver.maps.LatLng(36.4, 127.8),
      zoom: 8,
      minZoom: 6,
      mapDataControl: false,
      scaleControl: false,
      zoomControl: true,
      zoomControlOptions: { position: naver.maps.Position.RIGHT_BOTTOM },
    });

    createMarkers();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
