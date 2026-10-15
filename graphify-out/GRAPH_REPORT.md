# Graph Report - _pnu_seat  (2026-10-15)

## Corpus Check
- 9 files · ~6,113 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 144 nodes · 190 edges · 9 communities
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `dbf5865f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server.js
- app.js
- probe-pnul.js
- PNUSear
- scripts
- app.test.js
- PNUL Seat API Notes
- import-pnul-headers.js
- server.test.js

## God Nodes (most connected - your core abstractions)
1. `PNUSear` - 14 edges
2. `renderSeatList()` - 9 edges
3. `routeApi()` - 8 edges
4. `PNUL Seat API Notes` - 8 edges
5. `listSeats()` - 7 edges
6. `fetchSeats()` - 6 edges
7. `scripts` - 6 edges
8. `getPnulAuthToken()` - 5 edges
9. `savePnulHeaders()` - 5 edges
10. `normalizePnulSeat()` - 5 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (9 total, 0 thin omitted)

### Community 0 - "server.js"
Cohesion: 0.12
Nodes (31): EXCLUDED_SEATS, extractHeader(), findTimeValue(), firstDefined(), fs, getCookieNames(), getCookieValue(), getPnulAuthToken() (+23 more)

### Community 1 - "app.js"
Cohesion: 0.09
Nodes (32): authForm, authStatus, compareSeatNumber(), compareSeats(), fetchSeats(), formatRemaining(), getFetchedAtLabel(), getOfficialRemainingMinutes() (+24 more)

### Community 2 - "probe-pnul.js"
Cohesion: 0.20
Nodes (10): COOKIE, deriveAuthToken(), fs, getCookieNames(), getCookieValue(), getJson(), main(), printCookieDiagnostics() (+2 more)

### Community 3 - "PNUSear"
Cohesion: 0.14
Nodes (14): API, CLI로 세션 저장, PNUSear, 기능, 남은 시간 갱신, 동작 검사, 로그인 세션 저장, 반납 후 대기 (+6 more)

### Community 4 - "scripts"
Cohesion: 0.18
Nodes (10): engines, node, name, private, scripts, import-headers, mock, probe (+2 more)

### Community 5 - "app.test.js"
Cohesion: 0.22
Nodes (9): appSource, assert, availableSeat, createApp(), createElement(), fs, path, { test } (+1 more)

### Community 6 - "PNUL Seat API Notes"
Cohesion: 0.20
Nodes (8): PNUL Seat API Notes, 새벽벌도서관 2층 방 목록, 예약 가능 날짜, 예약 요청 형식, 좌석 단건 상세, 좌석 상세, 좌석 상태 필드, 취소/연장/반납

### Community 7 - "import-pnul-headers.js"
Cohesion: 0.29
Nodes (7): authToken, cookie, extractHeader(), fs, path, privateDir, readNextValue()

### Community 8 - "server.test.js"
Cohesion: 0.22
Nodes (7): assert, context, fetchedAt, fs, path, { test }, vm

## Knowledge Gaps
- **71 isolated node(s):** `settingsForm`, `roomsInput`, `refreshIntervalInput`, `refreshButton`, `authForm` (+66 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PNUSear` connect `PNUSear` to `PNUL Seat API Notes`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `renderSeatList()` (e.g. with `app.js` and `compareSeats()`) actually correct?**
  _`renderSeatList()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `settingsForm`, `roomsInput`, `refreshIntervalInput` to the rest of the system?**
  _71 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11693548387096774 - nodes in this community are weakly interconnected._
- **Should `app.js` be split into smaller, more focused modules?**
  _Cohesion score 0.0873015873015873 - nodes in this community are weakly interconnected._
- **Should `PNUSear` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._