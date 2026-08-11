#!/usr/bin/env python3
"""전 지점 좌표 전수 감사 (네트워크 필요).

각 지점에 대해 세 가지 독립 증거를 수집해 저장된 좌표를 심판한다:
  1. cinema POI — 저장 좌표 주변 bbox에서 amenity=cinema 노드 검색
  2. structured  — 도로명+번지 structured 검색으로 건물 매칭
  3. reverse     — 저장 좌표 역지오코딩. 도로명은 **완전 일치**로 비교
                   (부분 일치 금지: '풍무로'가 '풍무로57번길'에 매칭되면 안 됨)

판정: POI가 structured/주소와 정합하면 POI 채택, 없으면 structured와 200m
이내인지 확인. 어긋나면 플래그. 결과는 JSON 리포트로 저장하고 자동 수정은
하지 않는다 — 사람이(또는 에이전트가) 리포트를 보고 적용한다.
"""
import json, math, re, subprocess, sys, time, urllib.parse
from pathlib import Path

UA = "SpecialCinemaMap/1.0 (contact: tuenkle1011@gmail.com)"
BASE = "https://nominatim.openstreetmap.org"


def nomi(path, params):
    url = f"{BASE}/{path}?" + urllib.parse.urlencode({**params, "format": "json"})
    for _ in range(3):
        out = subprocess.run(["curl", "-sS", "--max-time", "20", "-A", UA, url],
                             capture_output=True, text=True).stdout
        time.sleep(1.1)
        try:
            return json.loads(out)
        except json.JSONDecodeError:
            time.sleep(2)
    return None


def dist_m(a, b):
    return round(math.hypot((a[0] - b[0]) * 111000,
                            (a[1] - b[1]) * 111000 * math.cos(math.radians(a[0]))))


def road_and_number(address):
    m = re.search(r"([가-힣A-Za-z0-9·]+(?:대로|로|길)(?:\d+번?길)?)\s+([\d-]+)", address)
    return (m.group(1), m.group(2)) if m else (None, None)


def road_matches(road, display):
    """display의 컴포넌트 중 도로명과 '완전히' 일치하는 것이 있는가."""
    return any(part.strip() == road for part in display.split(","))


def audit(theater):
    lat, lng = theater["lat"], theater["lng"]
    road, num = road_and_number(theater["address"])
    r = {"id": theater["id"], "name": theater["name"], "stored": [lat, lng]}

    # 1. 주변 cinema POI
    box = f"{lng-0.02},{lat+0.02},{lng+0.02},{lat-0.02}"
    pois = nomi("search", {"q": "cinema", "viewbox": box, "bounded": 1, "limit": 10}) or []
    pois = [(float(p["lat"]), float(p["lon"]), p["display_name"])
            for p in pois if p.get("type") == "cinema"]
    if pois:
        nearest = min(pois, key=lambda p: dist_m((lat, lng), p[:2]))
        r["poi"] = {"coord": nearest[:2], "dist": dist_m((lat, lng), nearest[:2]),
                    "display": nearest[2][:80]}

    # 2. structured 건물 매칭
    if road and num:
        s = nomi("search", {"street": f"{num} {road}", "countrycodes": "kr", "limit": 1})
        if s:
            c = (float(s[0]["lat"]), float(s[0]["lon"]))
            r["structured"] = {"coord": c, "dist": dist_m((lat, lng), c),
                               "display": s[0]["display_name"][:80]}

    # 3. 역지오코딩 도로명 완전 일치
    rev = nomi("reverse", {"lat": lat, "lon": lng, "zoom": 17})
    if rev and isinstance(rev, dict):
        r["reverse"] = rev.get("display_name", "")[:80]
        r["reverse_road_ok"] = bool(road) and road_matches(road, r["reverse"])

    # 판정
    poi_d = r.get("poi", {}).get("dist")
    st_d = r.get("structured", {}).get("dist")
    if poi_d is not None and poi_d <= 250:
        r["verdict"] = "ok-poi"
    elif st_d is not None and st_d <= 200 and r.get("reverse_road_ok"):
        r["verdict"] = "ok-structured"
    elif poi_d is not None:
        r["verdict"] = f"FLAG-poi-{poi_d}m"
    elif st_d is not None:
        r["verdict"] = f"FLAG-structured-{st_d}m"
    else:
        r["verdict"] = "FLAG-no-evidence"
    return r


def main():
    src = Path(__file__).resolve().parent.parent / "data" / "theaters.json"
    data = json.loads(src.read_text(encoding="utf-8"))
    out = []
    for i, t in enumerate(data):
        r = audit(t)
        out.append(r)
        print(f"[{i+1}/{len(data)}] {t['name']}: {r['verdict']}", flush=True)
    dest = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("geo-audit-report.json")
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("report ->", dest)


if __name__ == "__main__":
    main()
