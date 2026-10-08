# PNUSear

부산대학교 도서관 좌석의 남은 시간을 로컬에서 확인하는 조회 전용 웹앱입니다.

새벽벌도서관 2층 `1열람실`, `새벽별당[24h]-A`, `새벽별당[24h]-B` 좌석을 대상으로 PNUL 좌석 API의 `remainingTime` 값을 가져와 좌석별 남은 시간을 보여줍니다.

## 기능

- 좌석별 상태와 남은 시간 표시
- 공식 API의 분 단위 값(`remainingTime`)과 조회 시각 표시
- 반납 후 25초 대기 타이머와 공식 예약 가능 상태 확인
- 5초, 10초, 30초 단위 자동 새로고침
- 브라우저에서 로그인 세션 `Cookie` / `pyxis-auth-token` 저장
- 사용할 수 없는 특정 좌석 제외

이 앱은 좌석 조회만 수행합니다. 예약, 취소, 연장, 반납 요청은 보내지 않습니다.

## 남은 시간 갱신

초 단위 타이머는 공식 분 단위 값과 조회 시각으로 계산한 추정값입니다. 화면의 `조회`·`새로고침` 버튼과 자동 새로고침에는 같은 갱신 기준이 적용됩니다.

- 같은 열람실의 같은 좌석에서 공식 분 값과 사용 상태가 같으면 기존 타이머 유지
- 공식 분 값이 줄거나 늘어나면 최신 응답을 기준으로 타이머 갱신
- 사용 상태가 바뀌거나 새로 조회된 좌석이면 최신 응답 반영
- 공식 분 값이 없거나 유효하지 않으면 최신 응답의 시간 사용
- 타이머를 유지하는 동안에도 조회 시각과 공식값 표시는 최신 응답으로 갱신

브라우저 페이지를 다시 불러오면 첫 조회 결과로 타이머를 시작합니다.

## 반납 후 대기

반납된 좌석이 아직 예약 불가이면 `반납 후 대기` 상태와 25초 카운트다운을 표시합니다. 다시 조회해도 대기 타이머는 초기화되지 않습니다. 비활성 좌석이나 사용이 제한된 좌석은 `사용 불가`로 표시합니다.

현재 API 응답에는 반납 시각이 없어 대기 상태를 처음 확인한 시점부터 25초를 추정합니다. 따라서 화면에는 `25초 후 사용 가능 예상`처럼 표시하며, 공식 예약 가능 상태가 먼저 확인되면 즉시 `사용 가능`으로 전환합니다.

25초가 끝나면 자동 새로고침 설정과 관계없이 바로 다시 조회합니다. 공식값이 여전히 예약 불가이면 `예약 가능 확인 중` 상태를 유지하고 5초 간격으로 확인합니다. 조회가 실패해도 마지막으로 확인한 좌석과 타이머는 유지하며, 조회 실패 메시지를 표시합니다.

대기 중 다른 사용자가 좌석을 사용하면 사용 중 상태와 새 남은 시간으로 전환합니다. 브라우저 페이지를 다시 불러오면 대기 시간도 첫 조회 시점부터 다시 추정합니다.

관련 API 필드는 [PNUL 좌석 API 참고 문서](docs/pnul-api.md#좌석-상태-필드)를 확인하십시오.

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

## 동작 검사

타이머 갱신, 반납 대기, 좌석 상태 변환의 회귀 검사는 다음 명령으로 실행하십시오. 실제 PNUL API 연결이나 로그인 세션 없이 실행할 수 있습니다.

```bash
npm test
```

## 제외 좌석

다음 좌석은 시간 체크 목록에서 제외합니다.

- `1열람실`: 363번
- `새벽별당[24h]-A`: 98번, 99번, 100번, 101번
- `새벽별당[24h]-B`: 146번, 147번

## 파일 구조

```text
package.json  # npm 스크립트
index.html
styles.css
app.js
server.js
tools/
tests/       # 화면 동작 회귀 검사
docs/
private/      # git 제외
```
