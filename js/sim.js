(function () {
  "use strict";

  // ---------- 상수 (극장 설계 표준 근사값) ----------
  const EYE = 1.15;        // 착석 시 바닥→눈 높이 (m)
  const HEAD_TOP = 1.25;   // 착석 시 바닥→머리 꼭대기 (m)
  const SEAT_W = 0.56;     // 좌석 폭 (m)
  const ROW_PITCH = 1.1;   // 열 간격 (m)
  const RAKE = 0.3;        // 스타디움 단차 (m/열)
  const SCALE = 30;        // 렌더링 px/m

  const FORMAT_LABEL = { IMAX: "IMAX", DolbyCinema: "Dolby Cinema" };

  const state = { halls: [], hall: null, seat: null };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // ---------- 관 모델 ----------
  // 파라메트릭 기본값 + data/halls.json의 실조사값 오버라이드
  function buildHall(theater, aud, override) {
    const W = aud.screenW, H = aud.screenH;
    const o = override || {};
    let seatsPerRow = o.maxSeatsPerRow || Math.min(46, Math.max(12, Math.round(W / 0.62)));
    let rows = o.rows || null;
    const totalSeats = o.seats || aud.seats || null;
    if (!rows) {
      rows = totalSeats
        ? Math.min(20, Math.max(6, Math.round(totalSeats / seatsPerRow)))
        : Math.min(16, Math.max(8, Math.round(6 + W * 0.28)));
    }
    if (totalSeats && !o.maxSeatsPerRow) {
      seatsPerRow = Math.min(48, Math.max(10, Math.round(totalSeats / rows)));
    }
    return {
      id: theater.id + "-" + aud.format,
      theaterId: theater.id,
      name: theater.name,
      audName: aud.name,
      format: aud.format,
      W, H,
      screenBottom: o.screenBottom ?? Math.min(1.1, Math.max(0.3, 1.3 - H * 0.04)),
      rows,
      seatsPerRow,
      firstRow: o.firstRow ?? Math.max(4.5, W * 0.35),
      rowPitch: o.rowPitch ?? ROW_PITCH,
      rake: o.rake ?? RAKE,
      flatRows: o.flatRows ?? 2,
      rowLetters: o.rowLetters || null,
      sweetRows: o.sweetRows || null,
      sweetNote: o.sweetNote || null,
      hallNote: o.hallNote || null,
      estimated: !o.rows, // 실조사 열 수가 없으면 추정 모델
    };
  }

  function rowLabel(hall, k) {
    // rowLetters "A~N" 형태가 있으면 그 시작 문자부터
    let start = 65;
    if (hall.rowLetters) {
      const m = hall.rowLetters.match(/^([A-Z])/i);
      if (m) start = m[1].toUpperCase().charCodeAt(0);
    }
    return String.fromCharCode(start + k);
  }

  function sweetRowSet(hall) {
    // "J~L" / "J-L" / "J" 파싱 → 0-based 열 인덱스 집합
    const set = new Set();
    if (!hall.sweetRows) return set;
    const m = hall.sweetRows.match(/([A-Z])\s*[~\-]\s*([A-Z])/i);
    const startChar = hall.rowLetters ? hall.rowLetters.match(/^([A-Z])/i)[1].toUpperCase().charCodeAt(0) : 65;
    if (m) {
      const a = m[1].toUpperCase().charCodeAt(0) - startChar;
      const b = m[2].toUpperCase().charCodeAt(0) - startChar;
      for (let k = Math.max(0, a); k <= Math.min(hall.rows - 1, b); k++) set.add(k);
    } else {
      const s = hall.sweetRows.match(/([A-Z])/i);
      if (s) set.add(s[1].toUpperCase().charCodeAt(0) - startChar);
    }
    return set;
  }

  // ---------- 좌석 기하 ----------
  function seatPos(hall, row, col) {
    const z = hall.firstRow + row * hall.rowPitch; // 스크린으로부터의 거리
    const floorY = Math.max(0, row - hall.flatRows + 1) * hall.rake * (row >= hall.flatRows ? 1 : 0);
    const x = (col - (hall.seatsPerRow - 1) / 2) * SEAT_W;
    return { x, eyeY: floorY + EYE, floorY, z };
  }

  const deg = (r) => (r * 180) / Math.PI;

  function metrics(hall, row, col) {
    const p = seatPos(hall, row, col);
    const sTop = hall.screenBottom + hall.H;
    const sBot = hall.screenBottom;
    const sCy = sBot + hall.H / 2;
    // 수평 시야각: 좌/우 엣지까지의 방위각 차
    const aL = Math.atan2(-hall.W / 2 - p.x, p.z);
    const aR = Math.atan2(hall.W / 2 - p.x, p.z);
    const hFov = deg(aR - aL);
    const dC = Math.hypot(p.x, p.z);
    const vCenter = deg(Math.atan2(sCy - p.eyeY, dC)); // 스크린 중심까지 상하각 (+위)
    const vTop = deg(Math.atan2(sTop - p.eyeY, dC));   // 상단 엣지까지 (목꺾임)
    const offset = Math.abs(deg(Math.atan2(p.x, p.z))); // 중심축에서 벗어난 각
    return { hFov, vCenter, vTop, offset, dist: Math.hypot(dC, sCy - p.eyeY) };
  }

  // 시야 점수 0~100
  function score(m) {
    let s = 100;
    // 수평 시야각: SMPTE 권장 최소 30°, THX 36°, 몰입 최적 45~70°
    if (m.hFov < 26) s -= 40;
    else if (m.hFov < 36) s -= 20;
    else if (m.hFov > 95) s -= 35;
    else if (m.hFov > 80) s -= 15;
    // 상단 목꺾임: 35° 초과부터 급감
    if (m.vTop > 50) s -= 35;
    else if (m.vTop > 35) s -= 18;
    // 중심 오프셋(사이드 왜곡)
    if (m.offset > 22) s -= 25;
    else if (m.offset > 12) s -= 10;
    // 시선이 심하게 아래를 향하면(뒷열 높은 단차) 소폭 감점
    if (m.vCenter < -12) s -= 8;
    return Math.max(0, Math.min(100, s));
  }

  function grade(s) {
    if (s >= 88) return ["명당", "#62b0ff"];
    if (s >= 72) return ["좋음", "#4a8fd9"];
    if (s >= 55) return ["보통", "#3a6ea5"];
    return ["아쉬움", "#2c4a6e"];
  }

  function heatColor(s) {
    // 시야 점수용 단일 색상(블루) 순차 램프 — 다크 서피스 위 밝기 단조 증가
    const t = Math.max(0, Math.min(1, (s - 40) / 60));
    const c0 = [30, 58, 95], c1 = [98, 176, 255];
    const c = c0.map((v, i) => Math.round(v + (c1[i] - v) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  // ---------- 3D 뷰 렌더링 (CSS 3D) ----------
  function screenTexture(W, H) {
    // 외부 이미지 없이 인라인 SVG 테스트 영상 프레임
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W * 10} ${H * 10}">` +
      `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#2c5f8a"/><stop offset="0.62" stop-color="#c96f3a"/>` +
      `<stop offset="0.63" stop-color="#1f2430"/><stop offset="1" stop-color="#12161f"/>` +
      `</linearGradient></defs>` +
      `<rect width="100%" height="100%" fill="url(#sky)"/>` +
      `<circle cx="${W * 5}" cy="${H * 5.6}" r="${H * 1.4}" fill="#f5c66b" opacity="0.9"/>` +
      `<rect x="${W * 2.5}" y="${H * 8.4}" width="${W * 5}" height="${H * 0.7}" rx="4" fill="#000" opacity="0.45"/>` +
      `<text x="${W * 5}" y="${H * 8.95}" text-anchor="middle" font-size="${H * 0.5}" fill="#fff" font-family="sans-serif">자막은 이 위치에 표시됩니다</text>` +
      `</svg>`;
    return "url('data:image/svg+xml," + encodeURIComponent(svg) + "')";
  }

  function renderView(hall, row, col) {
    const scene = document.getElementById("sim-scene");
    const view = document.getElementById("sim-view");
    const p = seatPos(hall, row, col);
    const s = SCALE;

    // 표시 화각 → CSS perspective 초점거리
    const vw = view.clientWidth;
    const F = (vw / 2) / Math.tan((70 / 2) * Math.PI / 180);
    view.style.perspective = F + "px";

    const el = [];
    const plane = (w, h, cx, cy, cz, style) =>
      `<div class="sim-plane" style="width:${w * s}px;height:${h * s}px;` +
      `transform:translate(-50%,-50%) translate3d(${(cx) * s}px,${(-cy) * s}px,${(-cz) * s}px);${style}"></div>`;

    // 스크린 (눈 기준 상대 좌표)
    const sCy = hall.screenBottom + hall.H / 2;
    el.push(plane(hall.W, hall.H, 0 - p.x, sCy - p.eyeY, p.z,
      `background-image:${screenTexture(hall.W, hall.H)};background-size:100% 100%;` +
      `box-shadow:0 0 ${s * 1.5}px rgba(120,170,255,0.25);`));

    // 앞 열 실루엣 (머리 스캘럽) — 바닥에서 머리 꼭대기(HEAD_TOP)까지
    for (let r = 0; r < row; r++) {
      const q = seatPos(hall, r, col);
      const hgt = HEAD_TOP;
      const cy = q.floorY + hgt / 2 - p.eyeY;
      const hallW = hall.seatsPerRow * SEAT_W + 2;
      el.push(plane(hallW, hgt, 0 - p.x, cy, p.z - q.z,
        `background:radial-gradient(circle ${0.2 * s}px at ${0.31 * s}px ${0.08 * s}px,#05070b 62%,transparent 63%) 0 0/${0.62 * s}px ${hgt * s}px repeat-x,#080a10;` +
        `opacity:0.97;`));
    }

    // 측벽 (깊이 단서)
    const wallW = hall.firstRow + hall.rows * hall.rowPitch;
    const hallHalf = (hall.seatsPerRow * SEAT_W) / 2 + 1.2;
    for (const side of [-1, 1]) {
      el.push(
        `<div class="sim-plane" style="width:${wallW * s}px;height:${9 * s}px;` +
        `transform:translate(-50%,-50%) translate3d(${(side * hallHalf - p.x) * s}px,${(-(4.5 - p.eyeY)) * s}px,${(-(p.z - wallW / 2)) * s}px) rotateY(90deg);` +
        `background:linear-gradient(#090c12,#04060a);opacity:0.55;"></div>`);
    }

    scene.innerHTML = el.join("");

    // 렌즈 시프트: 시선이 스크린 중심을 향하도록 장면을 수직 이동 (부분 적용)
    const phi = Math.atan2(sCy - p.eyeY, Math.hypot(p.x, p.z));
    scene.style.transform = `translateY(${Math.tan(phi) * F * 0.75}px)`;

    document.getElementById("sim-seat-label").textContent =
      `${rowLabel(hall, row)}열 ${col + 1}번 좌석에서 본 모습`;
  }

  function renderMetrics(hall, row, col) {
    const m = metrics(hall, row, col);
    const sc = score(m);
    const [label, color] = grade(sc);
    const sweet = sweetRowSet(hall).has(row);
    document.getElementById("sim-metrics").innerHTML =
      `<div class="sim-score" style="border-color:${color}"><b style="color:${color}">${sc}점</b> ${esc(label)}${sweet ? ' · <span class="sim-sweet-tag">커뮤니티 명당 열</span>' : ""}</div>` +
      `<dl class="sim-mgrid">` +
      `<dt>수평 시야각</dt><dd>${m.hFov.toFixed(0)}° <span class="sim-hint">(THX 권장 36°↑, 몰입 45~70°)</span></dd>` +
      `<dt>스크린 상단까지</dt><dd>${m.vTop.toFixed(0)}° <span class="sim-hint">(35° 넘으면 목이 아픈 각도)</span></dd>` +
      `<dt>시선 상하각</dt><dd>${m.vCenter >= 0 ? "올려봄 " : "내려봄 "}${Math.abs(m.vCenter).toFixed(0)}°</dd>` +
      `<dt>좌우 치우침</dt><dd>${m.offset.toFixed(0)}° <span class="sim-hint">(12° 넘으면 왜곡 체감)</span></dd>` +
      `<dt>스크린까지</dt><dd>약 ${m.dist.toFixed(1)}m</dd>` +
      `</dl>`;
  }

  // ---------- 좌석 배치도 ----------
  function renderMap(hall) {
    const map = document.getElementById("sim-map");
    const sweet = sweetRowSet(hall);
    // 통로: 좌석을 25% / 50% / 25% 세 블록으로
    const a1 = Math.round(hall.seatsPerRow * 0.25);
    const a2 = hall.seatsPerRow - a1;
    let html = `<div class="sim-screenbar">SCREEN — ${hall.W}m</div>`;
    for (let r = 0; r < hall.rows; r++) {
      html += `<div class="sim-row${sweet.has(r) ? " sweet" : ""}">` +
        `<span class="sim-rowlabel">${rowLabel(hall, r)}</span>`;
      for (let c = 0; c < hall.seatsPerRow; c++) {
        if (c === a1 || c === a2) html += `<span class="sim-aisle"></span>`;
        const sc = score(metrics(hall, r, c));
        const sel = state.seat && state.seat[0] === r && state.seat[1] === c;
        html += `<button class="sim-seat${sel ? " sel" : ""}" data-r="${r}" data-c="${c}" ` +
          `style="background:${heatColor(sc)}" title="${rowLabel(hall, r)}열 ${c + 1}번 — ${sc}점"></button>`;
      }
      html += `</div>`;
    }
    map.innerHTML = html;
    map.querySelectorAll(".sim-seat").forEach((b) =>
      b.addEventListener("click", () => selectSeat(+b.dataset.r, +b.dataset.c)));
  }

  function selectSeat(r, c) {
    state.seat = [r, c];
    document.querySelectorAll(".sim-seat.sel").forEach((b) => b.classList.remove("sel"));
    const btn = document.querySelector(`.sim-seat[data-r="${r}"][data-c="${c}"]`);
    if (btn) btn.classList.add("sel");
    renderView(state.hall, r, c);
    renderMetrics(state.hall, r, c);
  }

  function loadHall(hall) {
    state.hall = hall;
    const params = new URLSearchParams(location.search);
    params.set("h", hall.id);
    history.replaceState(null, "", "?" + params.toString());

    renderMap(hall);
    // 기본 선택: 중앙열보다 한 열 뒤 중앙 좌석
    const r = Math.min(hall.rows - 1, Math.ceil(hall.rows * 0.6));
    selectSeat(r, Math.floor(hall.seatsPerRow / 2));

    const notes = [];
    if (hall.estimated) notes.push("좌석 배치는 스크린 크기·좌석 수 기반 추정 모델입니다 (실제 배치도와 다를 수 있음).");
    else notes.push("열 수·좌석 수는 커뮤니티 실조사 기반, 세부 배치·단차는 근사입니다.");
    if (hall.sweetNote) notes.push("명당 참고: " + hall.sweetNote);
    if (hall.hallNote) notes.push(hall.hallNote);
    if (hall.format === "IMAX") notes.push("IMAX 곡면 스크린의 곡률은 반영하지 않은 평면 근사입니다.");
    document.getElementById("sim-foot").textContent = notes.join(" · ");
  }

  // ---------- 초기화 ----------
  async function init() {
    const [theaters, overrides] = await Promise.all([
      fetch("data/theaters.json").then((r) => r.json()),
      fetch("data/halls.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    ]);

    for (const t of theaters) {
      for (const a of t.auditoriums) {
        if ((a.format === "IMAX" || a.format === "DolbyCinema") && a.screenW) {
          state.halls.push(buildHall(t, a, overrides[t.id + "-" + a.format]));
        }
      }
    }
    state.halls.sort((a, b) => (a.format + a.name).localeCompare(b.format + b.name, "ko"));

    const sel = document.getElementById("hall-select");
    sel.innerHTML = state.halls.map((h) =>
      `<option value="${h.id}">[${FORMAT_LABEL[h.format]}] ${esc(h.name)}</option>`).join("");
    sel.addEventListener("change", () => {
      loadHall(state.halls.find((h) => h.id === sel.value));
    });

    const want = new URLSearchParams(location.search).get("h");
    const initial = state.halls.find((h) => h.id === want) ||
      state.halls.find((h) => h.id === "cgv-yongsan-IMAX") || state.halls[0];
    sel.value = initial.id;
    loadHall(initial);

    window.addEventListener("resize", () => {
      if (state.hall && state.seat) renderView(state.hall, state.seat[0], state.seat[1]);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
