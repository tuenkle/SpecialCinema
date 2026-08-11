#!/usr/bin/env python3
"""theaters.json 스키마·정합성 검사.

공식 페이지 지점 수와의 대조는 사람이 한다 — 이 스크립트는 포맷별 카운트를
출력해 그 대조를 쉽게 만들 뿐, 목록의 완전성까지 보장하지 못한다
(data/DATA_SOURCES.md의 체크리스트 참고).
"""
import json
import sys
from pathlib import Path

FORMATS = ("IMAX", "ScreenX", "DolbyCinema")
REQUIRED_THEATER_KEYS = {"id", "chain", "name", "address", "lat", "lng", "auditoriums"}
REQUIRED_AUD_KEYS = {"format", "name", "screen", "projection", "sound", "seats", "notes"}

# 주소의 시/도가 좌표와 일치하는지 검사하는 광역 바운딩 박스 (근사값, 여유 포함)
PROVINCE_BBOX = {
    "서울특별시": (37.42, 37.72, 126.76, 127.19),
    "인천광역시": (37.33, 37.62, 126.36, 126.80),
    "경기도": (36.89, 38.30, 126.38, 127.86),
    "강원특별자치도": (37.02, 38.62, 127.08, 129.37),
    "대전광역시": (36.18, 36.50, 127.24, 127.56),
    "세종특별자치시": (36.41, 36.73, 127.11, 127.42),
    "충청남도": (35.97, 37.03, 125.90, 127.65),
    "충청북도": (36.00, 37.22, 127.24, 128.66),
    "대구광역시": (35.60, 36.02, 128.34, 128.77),
    "부산광역시": (34.98, 35.40, 128.75, 129.31),
    "울산광역시": (35.31, 35.73, 128.96, 129.47),
    "경상남도": (34.55, 35.91, 127.57, 129.29),
    "경상북도": (35.57, 37.55, 127.79, 129.70),
    "전라남도": (33.89, 35.50, 125.06, 127.91),
    "전북특별자치도": (35.29, 36.16, 125.96, 127.92),
    "광주광역시": (35.05, 35.26, 126.64, 127.02),
    "제주특별자치도": (33.10, 33.61, 126.14, 126.98),
}


def main() -> int:
    path = Path(__file__).resolve().parent.parent / "data" / "theaters.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    errors = []

    ids = [t.get("id") for t in data]
    for dup in {i for i in ids if ids.count(i) > 1}:
        errors.append(f"중복 id: {dup}")

    counts = dict.fromkeys(FORMATS, 0)
    for t in data:
        name = t.get("name", "<이름 없음>")
        missing = REQUIRED_THEATER_KEYS - t.keys()
        if missing:
            errors.append(f"{name}: 누락 필드 {sorted(missing)}")
            continue
        if not (33 < t["lat"] < 39 and 124 < t["lng"] < 132):
            errors.append(f"{name}: 좌표가 한국 범위를 벗어남 ({t['lat']}, {t['lng']})")
        province = t["address"].split()[0]
        bbox = PROVINCE_BBOX.get(province)
        if bbox is None:
            errors.append(f"{name}: 알 수 없는 시/도 '{province}'")
        else:
            s, n, w, e = bbox
            if not (s <= t["lat"] <= n and w <= t["lng"] <= e):
                errors.append(f"{name}: 좌표가 주소의 시/도({province}) 범위를 벗어남 ({t['lat']}, {t['lng']})")
        if not t["auditoriums"]:
            errors.append(f"{name}: 특별관이 하나도 없음")
        for a in t["auditoriums"]:
            missing = REQUIRED_AUD_KEYS - a.keys()
            if missing:
                errors.append(f"{name}: 상영관 누락 필드 {sorted(missing)}")
            if a.get("format") not in FORMATS:
                errors.append(f"{name}: 알 수 없는 format {a.get('format')!r}")
            else:
                counts[a["format"]] += 1

    print(f"지점 {len(data)}개")
    for f in FORMATS:
        print(f"  {f}: {counts[f]}개관 — 공식 페이지 지점 수와 직접 대조할 것")

    if errors:
        print("\n오류:")
        for e in errors:
            print("  -", e)
        return 1
    print("\n스키마 검사 통과")
    return 0


if __name__ == "__main__":
    sys.exit(main())
