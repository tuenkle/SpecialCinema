# 특별관 지도 (SpecialCinema)

대한민국 전역의 **IMAX · ScreenX · Dolby Cinema** 특별관 위치를 네이버 지도에서 한눈에 보고,
각 상영관의 스펙(스크린 크기, 영사 방식, 사운드, 좌석 수)을 확인할 수 있는 정적 웹사이트입니다.

## 기능

- 네이버 지도 기반 전국 특별관 마커 표시
- 특별관 종류별 필터 (IMAX / ScreenX / Dolby Cinema)
- 마커 클릭 시 상영관별 스펙 카드 표시
  - 스크린 크기, 영사 방식, 사운드, 좌석 수, 특이사항
- 한 지점에 여러 특별관이 있으면 모두 표시 (예: CGV 용산아이파크몰 = IMAX + ScreenX)

## 실행 방법

1. **네이버 지도 API 키 발급**
   - [NAVER CLOUD PLATFORM → Maps](https://www.ncloud.com/product/applicationService/maps)에서 Application을 등록하고
     **Maps > Web Dynamic Map** 서비스의 클라이언트 ID(ncpKeyId)를 발급받습니다.
   - Application 설정의 *Web 서비스 URL*에 배포 도메인을 추가합니다
     (로컬 테스트 시 `http://localhost:8000` 등).

2. **키 입력**
   - `js/config.js`의 `NAVER_MAP_CLIENT_ID`에 발급받은 클라이언트 ID를 입력합니다.

3. **로컬 실행** — `fetch`로 데이터를 불러오므로 정적 서버가 필요합니다.

   ```bash
   python3 -m http.server 8000
   # http://localhost:8000 접속
   ```

4. **배포** — 순수 정적 사이트라 GitHub Pages, Vercel, Netlify 등에 그대로 올리면 됩니다.

## 데이터

- `data/theaters.json`에 지점·상영관 정보가 들어 있습니다.
- 국내 특별관 브랜드 소속: **IMAX·ScreenX → CGV**, **Dolby Cinema → 메가박스** (독점).
- 스키마:

  ```json
  {
    "id": "cgv-yongsan",
    "chain": "CGV",
    "name": "CGV 용산아이파크몰",
    "address": "서울특별시 용산구 한강대로23길 55",
    "lat": 37.529,
    "lng": 126.964,
    "auditoriums": [
      {
        "format": "IMAX",            // IMAX | ScreenX | DolbyCinema
        "name": "IMAX LASER GT",     // 상영관 명칭 (없으면 null)
        "screen": "31m × 22.4m",     // 알 수 없으면 null
        "projection": "IMAX GT 듀얼 4K 레이저",
        "sound": "12채널",
        "seats": 624,
        "notes": "국내 최대 IMAX 스크린"
      }
    ]
  }
  ```

- 지점 개폐관·스펙 변경 시 이 파일만 수정하면 됩니다.

## 데이터 출처 및 주의

지점 목록과 스펙은 각 멀티플렉스 공식 사이트와 공개 자료를 바탕으로 정리한 것으로,
실제 운영 상황과 다를 수 있습니다. 관람 전 각 체인 공식 사이트에서 확인하세요.
