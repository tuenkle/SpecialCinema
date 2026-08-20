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
  const MAP_CENTER = { lat: 36.4, lng: 127.8 };
  const MAP_ZOOM = 8;

  const state = {
    provider: null,
    theaters: [],
    markers: new Map(), // theater.id -> marker handle
    activeFormats: new Set(["IMAX", "ScreenX", "DolbyCinema"]),
    selectedId: null,
  };

  // ---------- Map providers ----------
  // Each provider implements: addMarker(theater, html, onClick) -> handle,
  // setVisible(handle, visible), panTo(lat, lng)

  function loadNaverScript(clientId) {
    return new Promise((resolve, reject) => {
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

  async function createNaverProvider() {
    const clientId = (window.NAVER_MAP_CLIENT_ID || "").trim();
    if (!clientId) throw new Error("NO_CLIENT_ID");
    await loadNaverScript(clientId);

    const map = new naver.maps.Map("map", {
      center: new naver.maps.LatLng(MAP_CENTER.lat, MAP_CENTER.lng),
      zoom: MAP_ZOOM,
      minZoom: 6,
      mapDataControl: false,
      scaleControl: false,
      zoomControl: true,
      zoomControlOptions: { position: naver.maps.Position.RIGHT_BOTTOM },
    });

    return {
      name: "naver",
      addMarker(t, html, onClick) {
        const marker = new naver.maps.Marker({
          position: new naver.maps.LatLng(t.lat, t.lng),
          map,
          title: t.name,
          icon: { content: html, anchor: new naver.maps.Point(0, 0) },
        });
        naver.maps.Event.addListener(marker, "click", onClick);
        return marker;
      },
      setVisible(marker, visible) {
        marker.setMap(visible ? map : null);
      },
      panTo(lat, lng) {
        map.panTo(new naver.maps.LatLng(lat, lng));
      },
    };
  }

  function createLeafletProvider() {
    if (!window.L) throw new Error("LEAFLET_MISSING");

    const map = L.map("map", {
      center: [MAP_CENTER.lat, MAP_CENTER.lng],
      zoom: MAP_ZOOM,
      minZoom: 6,
      zoomControl: false,
    });
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    return {
      name: "leaflet",
      addMarker(t, html, onClick) {
        const marker = L.marker([t.lat, t.lng], {
          title: t.name,
          icon: L.divIcon({ className: "marker-anchor", html, iconSize: null }),
        }).addTo(map);
        marker.on("click", onClick);
        marker._map_ref = map;
        return marker;
      },
      setVisible(marker, visible) {
        if (visible) marker.addTo(map);
        else marker.remove();
      },
      panTo(lat, lng) {
        map.panTo([lat, lng]);
      },
    };
  }

  // 페이지가 지정한 엔진만 사용: index.html → "naver", osm.html → "osm"
  async function createProvider() {
    if (window.MAP_ENGINE === "osm") return createLeafletProvider();
    return createNaverProvider();
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
      const marker = state.markers.get(t.id);
      if (marker) state.provider.setVisible(marker, isVisible(t));
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
      const marker = state.provider.addMarker(t, markerHtml(t), () =>
        selectTheater(t)
      );
      state.markers.set(t.id, marker);
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

  function audCard(a, theaterId) {
    const simLink =
      (a.format === "IMAX" || a.format === "DolbyCinema") && a.screenW
        ? '<a class="aud-sim-link" href="sim.html?h=' + theaterId + "-" + a.format +
          '">🪑 좌석 시야 시뮬레이션 →</a>'
        : "";
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
      simLink +
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
      '<div class="aud-list">' + audsToShow.map((a) => audCard(a, t.id)).join("") + "</div>";

    document.getElementById("panel").hidden = false;

    state.provider.panTo(t.lat, t.lng);
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
      state.provider = await createProvider();
    } catch (e) {
      const notice = document.getElementById("map-notice");
      if (notice) notice.hidden = false;
      return;
    }

    createMarkers();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
