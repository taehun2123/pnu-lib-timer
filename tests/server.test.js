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

test("공식 예약 가능 값과 관계없이 빈 좌석은 사용 가능입니다", () => {
  for (const flags of [{ isReservable: false }, { isReservable: true }, { showReservationButton: false }, {}]) {
    const seat = normalize({ isActive: true, isOccupied: false, ...flags });
    assert.equal(seat.status, "available");
    assert.equal(seat.statusLabel, "사용 가능");
    assert.equal(seat.remainingMs, 0);
  }
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
