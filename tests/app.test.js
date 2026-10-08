const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");

function createElement() {
  const listeners = new Map();
  return {
    value: "",
    textContent: "",
    children: [],
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    addEventListener(type, callback) { listeners.set(type, callback); },
    dispatch(type) { return listeners.get(type)({ preventDefault() {} }); },
  };
}

async function createApp(initialSeats, refreshIntervalMs = 10000) {
  let now = Date.parse("2026-10-08T00:00:00Z");
  let responseSeats = initialSeats;
  let nextRequestError = null;
  let nextRequestGate = null;
  let requestCount = 0;
  let nextTimeoutId = 1;
  const elements = new Map();
  const intervals = new Map();
  const timeouts = new Map();
  const windowListeners = new Map();
  const context = vm.createContext({
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    },
    URLSearchParams,
    document: {
      querySelector(selector) {
        if (!elements.has(selector)) elements.set(selector, createElement());
        return elements.get(selector);
      },
      createElement,
    },
    localStorage: { getItem() { return JSON.stringify({ refreshIntervalMs }); }, setItem() {} },
    window: {
      setInterval(callback, ms) { intervals.set(ms, callback); return ms; },
      clearInterval(id) { intervals.delete(id); },
      setTimeout(callback, ms) {
        const id = nextTimeoutId++;
        timeouts.set(id, { callback, dueAt: now + ms });
        return id;
      },
      clearTimeout(id) { timeouts.delete(id); },
      addEventListener(type, callback) { windowListeners.set(type, callback); },
    },
    async fetch(url) {
      if (url !== "/api/status") {
        requestCount += 1;
        if (nextRequestError) {
          const error = nextRequestError;
          nextRequestError = null;
          throw new Error(error);
        }
      }
      const data = url === "/api/status" ? { provider: "mock" } : {
        seats: responseSeats.map((seat) => ({
          roomNo: 69,
          seatNo: 120,
          status: "occupied",
          ...seat,
          fetchedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + (seat.durationMs ?? seat.remainingMinutes * 60000)).toISOString(),
        })),
      };
      if (url !== "/api/status" && nextRequestGate) {
        const gate = nextRequestGate;
        nextRequestGate = null;
        await gate;
      }
      return { ok: true, async json() { return data; } };
    },
  });
  vm.runInContext(appSource, context);
  await new Promise(setImmediate);

  return {
    async refresh(seats, elapsedMs = 10000, trigger = "manual") {
      now += elapsedMs;
      responseSeats = seats;
      if (trigger === "auto") intervals.get(10000)();
      else elements.get(trigger === "submit" ? "#settings-form" : "#refresh-button")
        .dispatch(trigger === "submit" ? "submit" : "click");
      await new Promise(setImmediate);
    },
    tick(elapsedMs) {
      now += elapsedMs;
      intervals.get(1000)?.();
      for (const [id, timer] of [...timeouts]) {
        if (timer.dueAt <= now) {
          timeouts.delete(id);
          timer.callback();
        }
      }
    },
    flush() { return new Promise(setImmediate); },
    setResponse(seats) { responseSeats = seats; },
    failNextRequest(message = "연결 실패") { nextRequestError = message; },
    deferNextRequest() {
      let release;
      nextRequestGate = new Promise((resolve) => { release = resolve; });
      return release;
    },
    requestCount() { return requestCount; },
    hide() { windowListeners.get("pagehide")(); },
    show() { windowListeners.get("pageshow")(); },
    rows() {
      return elements.get("#seat-list").children.map((row) => ({
        name: row.children[0].children[0].textContent,
        detail: row.children[0].children[1].textContent,
        time: row.children[1].children[0].textContent,
        official: row.children[1].children[1].textContent,
        className: row.className,
      }));
    },
  };
}

test("같은 공식 분 값이면 수동·자동·폼 조회 후에도 타이머가 이어집니다", async () => {
  const app = await createApp([{ remainingMinutes: 5 }]);
  const initialDetail = app.rows()[0].detail;
  assert.equal(app.rows()[0].time, "5분 00초");

  for (const [index, trigger] of ["manual", "auto", "submit"].entries()) {
    await app.refresh([{ remainingMinutes: "5" }], 10000, trigger);
    assert.equal(app.rows()[0].time, `4분 ${50 - index * 10}초`);
    assert.equal(app.rows()[0].official, "공식값 5분");
    assert.notEqual(app.rows()[0].detail, initialDetail);
  }
  app.tick(1000);
  assert.equal(app.rows()[0].time, "4분 29초");
});

test("공식 분 값이 줄거나 늘어나면 새 값으로 타이머가 갱신됩니다", async () => {
  const app = await createApp([{ remainingMinutes: 5 }]);
  await app.refresh([{ remainingMinutes: 4 }]);
  assert.equal(app.rows()[0].time, "4분 00초");
  assert.equal(app.rows()[0].official, "공식값 4분");
  await app.refresh([{ remainingMinutes: 6 }]);
  assert.equal(app.rows()[0].time, "6분 00초");
});

test("응답 순서가 바뀌어도 열람실과 좌석별로 타이머를 유지합니다", async () => {
  const first = { roomNo: 7, roomName: "A", id: 1, seatNo: 120, remainingMinutes: 5 };
  const second = { roomNo: 8, roomName: "B", id: 1, seatNo: 120, remainingMinutes: 3 };
  const app = await createApp([first, second]);
  await app.refresh([second, first]);
  assert.deepEqual(app.rows().map(({ name, time }) => [name, time]), [
    ["B / 120번", "2분 50초"],
    ["A / 120번", "4분 50초"],
  ]);
});

test("좌석 ID가 없는 응답도 같은 열람실의 좌석 번호로 구분합니다", async () => {
  const seats = [{ seatNo: 120, remainingMinutes: 5 }, { seatNo: 121, remainingMinutes: 3 }];
  const app = await createApp(seats);
  await app.refresh([...seats].reverse());
  assert.deepEqual(app.rows().map(({ name, time }) => [name, time]), [
    ["열람실 69 / 121번", "2분 50초"],
    ["열람실 69 / 120번", "4분 50초"],
  ]);
});

test("사용 가능 상태로 바뀌거나 다시 사용 중이 되면 새 상태를 반영합니다", async () => {
  const app = await createApp([{ remainingMinutes: 5 }]);
  await app.refresh([{ status: "available", remainingMinutes: 5 }]);
  assert.equal(app.rows()[0].time, "사용 가능");
  await app.refresh([{ remainingMinutes: 5 }]);
  assert.equal(app.rows()[0].time, "5분 00초");
});

test("처음 조회되거나 목록에서 사라졌다 다시 나타난 좌석은 새 타이머를 사용합니다", async () => {
  const app = await createApp([{ remainingMinutes: 5 }]);
  await app.refresh([{ seatNo: 121, remainingMinutes: 5 }]);
  assert.equal(app.rows()[0].time, "5분 00초");
  await app.refresh([{ seatNo: 120, remainingMinutes: 5 }]);
  assert.equal(app.rows()[0].time, "5분 00초");
});

test("공식값이 없거나 유효하지 않으면 최신 응답의 시간을 사용합니다", async () => {
  for (const remainingMinutes of [null, undefined, "", -1, "invalid"]) {
    const seat = { remainingMinutes, durationMs: 300000 };
    const app = await createApp([seat]);
    await app.refresh([seat]);
    assert.equal(app.rows()[0].time, "5분 00초");
    assert.equal(app.rows()[0].official, "공식값 없음");
  }
});

test("초 단위 타이머가 끝나도 공식 분 값이 같으면 다시 시작하지 않습니다", async () => {
  const app = await createApp([{ remainingMinutes: 1 }]);
  await app.refresh([{ remainingMinutes: 1 }], 70000);
  assert.equal(app.rows()[0].time, "0초");
  await app.refresh([{ remainingMinutes: 0 }]);
  assert.equal(app.rows()[0].time, "0초");
  assert.equal(app.rows()[0].official, "공식값 0분");
  await app.refresh([{ remainingMinutes: 2 }]);
  assert.equal(app.rows()[0].time, "2분 00초");
});

const cooldownSeat = { status: "cooldown", statusLabel: "반납 후 대기", remainingMinutes: 0 };

test("반납 대기 25초가 새로고침 후에도 이어지고 종료 시 바로 예약 가능 여부를 조회합니다", async () => {
  const app = await createApp([{ remainingMinutes: 5 }], 0);
  await app.refresh([cooldownSeat]);
  assert.equal(app.rows()[0].time, "25초 후 사용 가능 예상");
  assert.equal(app.rows()[0].official, "공식값 예약 불가");
  assert.equal(app.rows()[0].className, "seat-row cooldown");
  await app.refresh([cooldownSeat]);
  assert.equal(app.rows()[0].time, "15초 후 사용 가능 예상");

  app.setResponse([{ status: "available", remainingMinutes: 0 }]);
  app.tick(15000);
  assert.equal(app.rows()[0].time, "예약 가능 확인 중");
  await app.flush();
  assert.equal(app.requestCount(), 4);
  assert.equal(app.rows()[0].time, "사용 가능");
  assert.equal(app.rows()[0].className, "seat-row available");
});

test("25초가 지나도 공식값이 예약 불가이면 확인 중 상태를 유지하고 재조회합니다", async () => {
  const app = await createApp([cooldownSeat], 0);
  app.tick(25000);
  await app.flush();
  assert.equal(app.rows()[0].time, "예약 가능 확인 중");
  assert.equal(app.rows()[0].official, "공식값 예약 불가");
  assert.equal(app.requestCount(), 2);
  app.setResponse([{ status: "available", remainingMinutes: 0 }]);
  app.tick(5000);
  await app.flush();
  assert.equal(app.rows()[0].time, "사용 가능");
  assert.equal(app.requestCount(), 3);
});

test("25초 이전에 공식 예약 가능 상태가 확인되면 즉시 반영합니다", async () => {
  const app = await createApp([cooldownSeat], 0);
  await app.refresh([{ status: "available", remainingMinutes: 0 }]);
  assert.equal(app.rows()[0].time, "사용 가능");
  app.tick(25000);
  await app.flush();
  assert.equal(app.requestCount(), 2);
});

test("대기 중 다른 사용자가 좌석을 사용하면 사용 시간으로 전환합니다", async () => {
  const app = await createApp([cooldownSeat], 0);
  await app.refresh([{ remainingMinutes: 10 }]);
  assert.equal(app.rows()[0].time, "10분 00초");
  app.tick(25000);
  await app.flush();
  assert.equal(app.requestCount(), 2);
  assert.equal(app.rows()[0].time, "9분 35초");
});

test("사용 불가 좌석에는 반납 대기 타이머를 시작하지 않습니다", async () => {
  const app = await createApp([{ status: "unavailable", statusLabel: "사용 불가", remainingMinutes: 0 }], 0);
  assert.equal(app.rows()[0].time, "사용 불가");
  assert.equal(app.rows()[0].official, "공식값 사용 불가");
  app.tick(30000);
  await app.flush();
  assert.equal(app.requestCount(), 1);
});

test("조회가 실패해도 반납 대기 타이머는 초기화되지 않습니다", async () => {
  const app = await createApp([cooldownSeat], 0);
  app.failNextRequest();
  await app.refresh([cooldownSeat]);
  assert.equal(app.rows()[0].time, "15초 후 사용 가능 예상");
  await app.refresh([cooldownSeat]);
  assert.equal(app.rows()[0].time, "5초 후 사용 가능 예상");
});

test("진행 중인 조회가 있으면 대기 종료 조회를 그 다음에 수행합니다", async () => {
  const app = await createApp([cooldownSeat], 0);
  const release = app.deferNextRequest();
  await app.refresh([cooldownSeat], 24000);
  app.setResponse([{ status: "available", remainingMinutes: 0 }]);
  app.tick(1000);
  assert.equal(app.requestCount(), 2);
  release();
  await app.flush();
  assert.equal(app.requestCount(), 3);
  assert.equal(app.rows()[0].time, "사용 가능");
});

test("페이지를 떠나면 반납 대기 종료 조회를 예약하지 않습니다", async () => {
  const app = await createApp([cooldownSeat], 0);
  app.hide();
  app.tick(30000);
  await app.flush();
  assert.equal(app.requestCount(), 1);
});

test("페이지를 떠난 뒤 조회가 완료되어도 재조회를 예약하지 않으며 돌아오면 다시 조회합니다", async () => {
  const app = await createApp([cooldownSeat], 0);
  const release = app.deferNextRequest();
  await app.refresh([cooldownSeat]);
  app.hide();
  release();
  await app.flush();
  app.tick(30000);
  await app.flush();
  assert.equal(app.requestCount(), 2);
  app.setResponse([{ status: "available", remainingMinutes: 0 }]);
  app.show();
  await app.flush();
  assert.equal(app.requestCount(), 3);
  assert.equal(app.rows()[0].time, "사용 가능");
});
