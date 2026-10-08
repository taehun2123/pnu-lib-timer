const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const context = vm.createContext({
  require(name) {
    if (name === "node:http") return { createServer() { return { listen() {} }; } };
    return require(name);
  },
  process: { env: {} },
  __dirname: path.join(__dirname, ".."),
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../server.js"), "utf8"), context);
const fetchedAt = new Date("2026-10-08T00:00:00Z");

function normalize(seat) {
  return context.normalizePnulSeat(69, { id: 1, no: 120, remainingTime: 0, ...seat }, fetchedAt);
}

test("사용 중이 아니어도 공식 예약 불가이면 반납 대기 상태입니다", () => {
  const seat = normalize({ isActive: true, isOccupied: false, isReservable: false });
  assert.equal(seat.status, "cooldown");
  assert.equal(seat.statusLabel, "반납 후 대기");
  assert.equal(seat.expiresAt, null);
  assert.equal(seat.remainingMs, null);
  assert.equal(seat.raw.isActive, true);
  assert.equal(seat.raw.isReservable, false);
});

test("공식 예약 가능 상태이면 사용 가능으로 바뀝니다", () => {
  const seat = normalize({ isActive: true, isOccupied: false, isReservable: true });
  assert.equal(seat.status, "available");
  assert.equal(seat.remainingMs, 0);
});

test("비활성·사용 불가·비활성화된 좌석에는 반납 대기 상태를 적용하지 않습니다", () => {
  for (const flags of [{ isActive: false }, { isUnavailable: true }, { isDisabled: true }]) {
    const seat = normalize({ isOccupied: false, isReservable: false, ...flags });
    assert.equal(seat.status, "unavailable");
    assert.equal(seat.statusLabel, "사용 불가");
    assert.equal(seat.remainingMs, null);
  }
});

test("예약 가능 표시가 있어도 사용 중인 좌석은 사용 중으로 처리합니다", () => {
  const seat = normalize({ isOccupied: true, isReservable: true, remainingTime: 5 });
  assert.equal(seat.status, "occupied");
  assert.equal(seat.remainingMs, 300000);
});

test("명시적인 예약 불가 값은 예약 버튼 표시보다 우선합니다", () => {
  const seat = normalize({ isOccupied: false, isReservable: false, showReservationButton: true });
  assert.equal(seat.status, "cooldown");
});

test("예약 가능 필드가 없으면 예약 버튼 표시를 사용합니다", () => {
  assert.equal(normalize({ isOccupied: false, showReservationButton: false }).status, "cooldown");
  assert.equal(normalize({ isOccupied: false, showReservationButton: true }).status, "available");
});
