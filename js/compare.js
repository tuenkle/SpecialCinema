(function () {
  "use strict";

  // 검증된 다크 서피스용 카테고리 팔레트 (고정 순서로 순환)
  const PALETTE = [
    "#3987e5", "#d95926", "#199e70", "#c98500",
    "#d55181", "#008300", "#9085e9", "#e66767",
  ];
  const TAB_LABEL = { IMAX: "IMAX", DolbyCinema: "Dolby Cinema" };

  const state = { theaters: [], tab: "IMAX" };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function shortName(t) {
    return t.name.replace(/^(CGV|메가박스)\s*/, "");
  }

  function entries(format) {
    const known = [], unknown = [];
    for (const t of state.theaters) {
      for (const a of t.auditoriums) {
        if (a.format !== format) continue;
        if (a.screenW && a.screenH) {
          known.push({
            id: t.id, name: shortName(t), w: a.screenW, h: a.screenH,
            est: !!a.screenEst, area: a.screenW * a.screenH,
          });
        } else {
          unknown.push(shortName(t));
        }
      }
    }
    known.sort((a, b) => b.area - a.area);
    return { known, unknown };
  }

  // ---------- Chart ----------
  function render() {
    const { known, unknown } = entries(state.tab);
    const chart = document.getElementById("cmp-chart");

    const PAD = { top: 18, right: 16, bottom: 34, left: 44 };
    const width = Math.min(chart.clientWidth || 960, 1100);
    const maxW = Math.max(...known.map((e) => e.w));
    const maxH = Math.max(...known.map((e) => e.h));
    const scale = (width - PAD.left - PAD.right) / (Math.ceil(maxW / 5) * 5);
    const gw = Math.ceil(maxW / 5) * 5, gh = Math.ceil(maxH / 2) * 2;
    const height = gh * scale + PAD.top + PAD.bottom;
    const x0 = PAD.left, y0 = height - PAD.bottom; // 좌하단 원점

    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(TAB_LABEL[state.tab])} 스크린 크기 비교">`;

    // 그리드 (5m 간격, 눈에 안 띄게) — 마지막 눈금에만 단위 표기
    const lastX = Math.floor(gw / 5) * 5, lastY = Math.floor(gh / 5) * 5;
    for (let m = 0; m <= gw; m += 5) {
      const x = x0 + m * scale;
      svg += `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${y0}" stroke="#2a3040" stroke-width="1"/>`;
      svg += `<text x="${x}" y="${y0 + 18}" fill="#9aa3b5" font-size="11" text-anchor="middle">${m}${m === lastX ? "m" : ""}</text>`;
    }
    for (let m = 0; m <= gh; m += 5) {
      const y = y0 - m * scale;
      svg += `<line x1="${x0}" y1="${y}" x2="${x0 + gw * scale}" y2="${y}" stroke="#2a3040" stroke-width="1"/>`;
      svg += `<text x="${x0 - 8}" y="${y + 4}" fill="#9aa3b5" font-size="11" text-anchor="end">${m}${m === lastY ? "m" : ""}</text>`;
    }

    // 큰 관부터 아래에 깔기 → 작은 관이 항상 위에 보임
    known.forEach((e, i) => {
      const w = e.w * scale, h = e.h * scale;
      const color = PALETTE[i % PALETTE.length];
      svg += `<rect class="cmp-rect" data-i="${i}" x="${x0}" y="${y0 - h}" width="${w}" height="${h}"
        fill="${color}" fill-opacity="0.92" stroke="#0f1115" stroke-width="2" rx="2"/>`;
    });

    // 라벨: 각 사각형의 우상단 안쪽 모서리는 항상 노출됨 (더 작은 면적의 관이 덮을 수 없음)
    const placed = [];
    known.forEach((e, i) => {
      const label = e.name + (e.est ? "*" : "");
      const lw = label.length * 11 + 14; // 대략적 폭
      let lx = x0 + e.w * scale - 6, ly = y0 - e.h * scale + 15;
      // 이미 놓인 라벨과 겹치면 아래로 내림
      for (let guard = 0; guard < 30; guard++) {
        const clash = placed.some((p) => Math.abs(p.ly - ly) < 17 && lx - lw < p.lx && p.lx - p.lw < lx);
        if (!clash) break;
        ly += 17;
      }
      placed.push({ lx, ly, lw });
      svg += `<g class="cmp-label" data-i="${i}">
        <rect x="${lx - lw}" y="${ly - 12}" width="${lw}" height="16" rx="8" fill="#0f1115" fill-opacity="0.78"/>
        <text x="${lx - 7}" y="${ly}" fill="#e8eaf0" font-size="11.5" font-weight="600" text-anchor="end">${esc(label)}</text>
      </g>`;
    });

    svg += "</svg>";
    chart.innerHTML = svg;

    // ---------- 목록 ----------
    document.getElementById("cmp-list-title").textContent =
      `${TAB_LABEL[state.tab]} — 면적순 ${known.length}개관`;
    document.getElementById("cmp-list").innerHTML = known.map((e, i) => `
      <li class="cmp-row" data-i="${i}">
        <span class="cmp-rank">${i + 1}</span>
        <span class="cmp-dot" style="background:${PALETTE[i % PALETTE.length]}"></span>
        <span class="cmp-name">${esc(e.name)}${e.est ? "<sup>*</sup>" : ""}</span>
        <span class="cmp-dim">${e.w}m × ${e.h}m</span>
        <span class="cmp-area">${Math.round(e.area)}㎡</span>
      </li>`).join("");
    document.getElementById("cmp-unknown").innerHTML = unknown.length
      ? `크기 미확인: ${unknown.map(esc).join(", ")}`
      : "";

    bindHover(known);
  }

  // ---------- Hover ----------
  function bindHover(known) {
    const chart = document.getElementById("cmp-chart");
    const tip = document.getElementById("cmp-tooltip");
    const rects = chart.querySelectorAll(".cmp-rect");

    function highlight(i, on) {
      rects.forEach((r) => {
        const match = r.dataset.i === String(i);
        r.style.strokeWidth = on && match ? "3" : "2";
        r.style.stroke = on && match ? "#ffffff" : "#0f1115";
        r.style.fillOpacity = on && !match ? "0.35" : "0.92";
      });
      document.querySelectorAll(".cmp-row").forEach((row) =>
        row.classList.toggle("hover", on && row.dataset.i === String(i)));
    }

    rects.forEach((r) => {
      r.addEventListener("mousemove", (ev) => {
        const e = known[+r.dataset.i];
        highlight(+r.dataset.i, true);
        tip.hidden = false;
        tip.innerHTML = `<strong>${esc(e.name)}</strong><br>${e.w}m × ${e.h}m · ${Math.round(e.area)}㎡${e.est ? "<br><span>* 추정치</span>" : ""}`;
        const wrap = chart.getBoundingClientRect();
        tip.style.left = Math.min(ev.clientX - wrap.left + 14, wrap.width - 170) + "px";
        tip.style.top = ev.clientY - wrap.top + 14 + "px";
      });
      r.addEventListener("mouseleave", () => { highlight(-1, false); tip.hidden = true; });
    });

    document.querySelectorAll(".cmp-row").forEach((row) => {
      row.addEventListener("mouseenter", () => highlight(+row.dataset.i, true));
      row.addEventListener("mouseleave", () => highlight(-1, false));
    });
  }

  // ---------- Init ----------
  async function init() {
    const res = await fetch("data/theaters.json");
    state.theaters = await res.json();

    document.querySelectorAll("#tabs .filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#tabs .filter-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.tab = btn.dataset.tab;
        render();
      });
    });

    render();
    window.addEventListener("resize", () => render());
  }

  document.addEventListener("DOMContentLoaded", init);
})();
