# PNUL Seat API Notes

확인일: 2026-06-13

기준 URL:

```text
https://lib.pusan.ac.kr/pyxis-api/1
```

`[API_URL]`은 `https://lib.pusan.ac.kr/pyxis-api`, `[HOMEPAGE_ID]`는 `1`로 확인했다.

## 새벽벌도서관 2층 방 목록

```http
GET /pyxis-api/1/seat-rooms?smufMethodCode=PC&branchId=2&buildingId=2&floor=2
```

확인된 방:

```text
7  새벽별당[24h]-A
8  새벽별당[24h]-B
69 1열람실
```

응답 예시 요약:

```json
{
  "success": true,
  "data": {
    "list": [
      { "id": 7, "name": "새벽별당[24h]-A", "seats": { "total": 115, "occupied": 115, "available": 0 } },
      { "id": 8, "name": "새벽별당[24h]-B", "seats": { "total": 94, "occupied": 94, "available": 0 } },
      { "id": 69, "name": "1열람실", "seats": { "total": 362, "occupied": 362, "available": 0 } }
    ]
  }
}
```

## 예약 가능 날짜

```http
GET /pyxis-api/1/seat-room-reservable-dates?smufMethodCode=PC&branchId=2&buildingId=2&floor=2
```

2026-06-13 확인 응답:

```json
{
  "success": true,
  "data": {
    "reservable": false,
    "reservableDates": null
  }
}
```

## 좌석 상세

```http
GET /pyxis-api/1/api/rooms/{roomId}/seats
GET /pyxis-api/1/api/rooms/{roomId}/seats?hopeDate=YYYY-MM-DD%20HH:mm
```

로그인 세션 없이 호출하면 다음 응답을 받는다.

```json
{
  "success": false,
  "code": "error.authentication.needLogin"
}
```

Angular 번들 설정의 인증 쿠키 이름은 `PUSAN_PYXIS3`, `PUSAN_PYXIS3_SS`로 확인했다. 실제 재현은 DevTools Network에서 로그인된 `api/rooms/{roomId}/seats` 요청의 `Cookie` 요청 헤더 전체를 복사하는 방식이 가장 안정적이다. Application 탭에서 값 몇 개만 옮기면 쿠키 이름 누락, 경로/도메인 차이, 세션 만료 때문에 `needLogin`이 계속 날 수 있다.

## 좌석 단건 상세

```http
GET /pyxis-api/1/api/rooms/{roomId}/seats/{seatId}
GET /pyxis-api/1/api/rooms/{roomId}/seats/{seatId}?hopeBeginTime=YYYY-MM-DD%20HH:mm
```

## 좌석 상태 필드

2026-10-08 좌석 상세 조회에서 확인한 필드는 `isActive`, `isOccupied`, `isReservable`, `seatChargeState`, `remainingTime`, `chargeTime`, `timeLine`입니다. 사용 중 좌석에서는 `seatChargeState`의 `CHARGE`, `TEMP_CHARGE` 값을 확인했습니다. 비활성 좌석에서는 `isActive=false`, `isOccupied=false`, `isReservable=false` 값이 함께 나타났습니다.

2026-10-15 조회에서 1열람실, 새벽별당[24h]-A, 새벽별당[24h]-B의 좌석 571개는 사용 여부와 관계없이 모두 `isReservable=false`였습니다. 빈 활성 좌석 141개도 같은 값이었으므로 `isReservable`은 좌석별 예약 가능 여부나 반납 대기 여부를 나타내지 않습니다. 로그인 계정의 예약 상태와 이 값의 관계는 확인하지 않았습니다.

화면 상태를 정할 때는 비활성·사용 제한 여부를 먼저 반영하고, 이후 `isOccupied`로 사용 중과 사용 가능을 구분합니다. `isReservable`과 `showReservationButton`은 상태 판단에 사용하지 않습니다.

서버 응답의 좌석 `status`에는 `occupied`, `available`, `unavailable`, `unknown`을 사용합니다. `unavailable`에서는 사용 시간용 `expiresAt`, `remainingMs`가 `null`입니다. `raw`에는 상태 확인을 위해 `isActive`, `isUnavailable`, `isDisabled`, `isReservable`, `seatChargeState`도 포함합니다.

조회한 응답의 `timeLine`은 `null`이며 반납 시각은 확인되지 않았습니다. 반납 후 25초 대기는 서버가 판단하지 않습니다. 화면이 사용 중 좌석의 사용 가능 전환을 확인한 시점부터 추정하며, 표시 기준은 [README의 반납 후 대기](../README.md#반납-후-대기)가 기준입니다.

## 예약 요청 형식

Angular 번들에서 확인한 요청 형식:

```http
POST /pyxis-api/1/api/seat-charges
Content-Type: application/json
Cookie: <로그인 세션 쿠키>
```

```json
{
  "seatId": 12345,
  "beginTime": "2026-06-13 14:00",
  "endTime": "2026-06-13 18:00",
  "companionPatrons": [],
  "smufMethodCode": "PC"
}
```

실제 예약 POST는 좌석을 배정하는 부작용이 있으므로 probe 스크립트에서는 실행하지 않는다.

## 취소/연장/반납

Angular 번들에서 확인한 경로:

```http
DELETE /pyxis-api/1/api/seat-charges/{seatChargeId}?smufMethodCode=PC
PUT    /pyxis-api/1/api/seat-charges/{seatChargeId}?smufMethodCode=PC
POST   /pyxis-api/1/api/seat-renewed-charges
POST   /pyxis-api/1/api/seat-discharges
```
