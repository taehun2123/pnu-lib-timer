# PNUSear

부산대학교 도서관 좌석의 남은 시간을 로컬에서 확인하는 조회 전용 웹앱입니다.

새벽벌도서관 2층 `1열람실`, `새벽별당[24h]-A`, `새벽별당[24h]-B` 좌석을 대상으로 PNUL 좌석 API의 `remainingTime` 값을 가져와 좌석별 남은 시간을 보여줍니다.

## 기능

- 좌석별 상태와 남은 시간 표시
- 공식 API의 분 단위 값(`remainingTime`)과 조회 시각 표시
- 5초, 10초, 30초 단위 자동 새로고침
- 브라우저에서 로그인 세션 `Cookie` / `pyxis-auth-token` 저장
- 사용할 수 없는 특정 좌석 제외

이 앱은 좌석 조회만 수행합니다. 예약, 취소, 연장, 반납 요청은 보내지 않습니다.

## 실행

Node.js 18 이상이 필요합니다.

```bash
PNUSEAR_PROVIDER=real PNUL_COOKIE_FILE=private/pnul-cookie.txt PNUL_AUTH_TOKEN_FILE=private/pnul-auth-token.txt node server.js
```

브라우저에서 아래 주소를 엽니다.

```text
http://127.0.0.1:4173
```

## 로그인 세션 저장

PNUL 좌석 상세 API는 로그인 세션이 있어야 조회됩니다.

1. 공식 부산대 도서관 좌석 페이지에서 로그인합니다.
2. DevTools Network에서 `api/rooms/{roomId}/seats` 요청을 엽니다.
3. Request Headers 전체 또는 `Copy as cURL` 내용을 복사합니다.
4. PNUSear 화면의 `로그인 세션` 입력창에 붙여넣고 `세션 저장`을 누릅니다.

저장된 파일:

```text
private/pnul-cookie.txt
private/pnul-auth-token.txt
```

`private/`는 `.gitignore`에 포함되어 있어 커밋되지 않습니다.

## CLI로 세션 저장

브라우저 대신 파일로 저장하려면 Headers 내용을 `private/pnul-headers.txt`에 넣고 실행합니다.

```bash
node tools/import-pnul-headers.js private/pnul-headers.txt
```

## API

```http
GET /api/status
GET /api/seats?rooms=새벽벌도서관 2층 1열람실,새벽별당
POST /api/import-headers
```

`POST /api/import-headers`는 로컬 `private/` 파일에 인증 정보를 저장하기 위한 엔드포인트입니다.

## 확인용 Probe

PNUL API 연결 상태를 터미널에서 직접 확인할 수 있습니다.

```bash
PNUL_COOKIE_FILE=private/pnul-cookie.txt PNUL_AUTH_TOKEN_FILE=private/pnul-auth-token.txt node tools/probe-pnul.js
```

## 제외 좌석

다음 좌석은 시간 체크 목록에서 제외합니다.

- `1열람실`: 363번
- `새벽별당[24h]-A`: 98번, 99번, 100번, 101번
- `새벽별당[24h]-B`: 146번, 147번

## 파일 구조

```text
index.html
styles.css
app.js
server.js
tools/
docs/
private/      # git 제외
```
