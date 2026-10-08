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

화면 상태를 정할 때는 비활성·사용 제한 여부와 사용 중 여부를 먼저 반영하고, 이후 공식 예약 가능 여부를 확인합니다. `isReservable=false`이면 `isOccupied=false`만으로 사용 가능하게 처리하지 않습니다. `isReservable`이 없으면 `showReservationButton`을 사용하며, 두 필드가 모두 없을 때만 사용 중 여부로 판단합니다.

서버 응답의 좌석 `status`에는 `occupied`, `available`, `cooldown`, `unavailable`, `unknown`을 사용합니다. 활성 좌석이 사용 중이 아니면서 공식 예약 불가이면 `cooldown`입니다. `cooldown`과 `unavailable`에서는 사용 시간용 `expiresAt`, `remainingMs`가 `null`입니다. `raw`에는 상태 확인을 위해 `isActive`, `isUnavailable`, `isDisabled`, `seatChargeState`도 포함합니다.

조회한 응답의 `timeLine`은 `null`이며 반납 시각은 확인되지 않았습니다. 실제 반납 직후 응답은 이번 조회에서 관찰하지 못했습니다. 반납 후 25초 대기는 사용자 확인을 바탕으로 화면에서 추정하며, 표시와 재조회 기준은 [README의 반납 후 대기](../README.md#반납-후-대기)가 기준입니다.

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
