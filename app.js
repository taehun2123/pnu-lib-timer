const STORAGE_KEY = "pnusear-seat-time-settings";
const DEFAULT_ROOMS = "새벽벌도서관 2층 1열람실, 새벽별당";
const RETURN_COOLDOWN_MS = 25000;

const settingsForm = document.querySelector("#settings-form");
const roomsInput = document.querySelector("#rooms");
const refreshIntervalInput = document.querySelector("#refresh-interval");
const refreshButton = document.querySelector("#refresh-button");
const authForm = document.querySelector("#auth-form");
const headersTextInput = document.querySelector("#headers-text");
const authStatus = document.querySelector("#auth-status");
const watchStatus = document.querySelector("#watch-status");
const providerStatus = document.querySelector("#provider-status");
const seatCount = document.querySelector("#seat-count");
const seatFilterInput = document.querySelector("#seat-filter");
const seatList = document.querySelector("#seat-list");

let settings = readSettings();
let latestSeats = [];
let autoRefreshTimer = null;
let liveRenderTimer = null;
let isFetchingSeats = false;
let isPageActive = true;

function readSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

function saveSettings(nextSettings) {
  settings = nextSettings;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function applySettingsToForm() {
  roomsInput.value = settings.rooms ?? DEFAULT_ROOMS;
  refreshIntervalInput.value = String(settings.refreshIntervalMs ?? 10000);
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error ?? `HTTP ${response.status}`);
  }
  return data;
}

function formatRemaining(ms) {
  if (!Number.isFinite(ms)) {
    return "시간 미확인";
  }

  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}시간 ${String(minutes).padStart(2, "0")}분 ${String(seconds).padStart(2, "0")}초`;
  }

  if (minutes > 0) {
    return `${minutes}분 ${String(seconds).padStart(2, "0")}초`;
  }

  return `${seconds}초`;
}

function isCoolingDown(seat) {
  return Date.parse(seat.cooldownUntil) > Date.now();
}

function getCurrentRemainingMs(seat) {
  if (isCoolingDown(seat)) {
    return Date.parse(seat.cooldownUntil) - Date.now();
  }

  if (seat.expiresAt) {
    const expiresAt = new Date(seat.expiresAt).getTime();
    if (Number.isFinite(expiresAt)) {
      return expiresAt - Date.now();
    }
  }

  return seat.remainingMs;
}

function getSortRemaining(seat) {
  if (seat.status === "available" && !isCoolingDown(seat)) {
    return 0;
  }

  const remainingMs = getCurrentRemainingMs(seat);
  return Number.isFinite(remainingMs) ? Math.max(0, remainingMs) : Number.POSITIVE_INFINITY;
}

function getSeatNumber(seat) {
  return Number.parseInt(String(seat.seatNo).replace(/\D/g, ""), 10);
}

function compareSeatNumber(left, right) {
  const leftNumber = getSeatNumber(left);
  const rightNumber = getSeatNumber(right);

  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return String(left.seatNo).localeCompare(String(right.seatNo), "ko-KR", { numeric: true });
}

function compareSeats(left, right) {
  const remainingDiff = getSortRemaining(left) - getSortRemaining(right);
  if (remainingDiff !== 0) {
    return remainingDiff;
  }

  const roomDiff = String(left.roomName ?? left.roomNo).localeCompare(String(right.roomName ?? right.roomNo), "ko-KR");
  if (roomDiff !== 0) {
    return roomDiff;
  }

  return compareSeatNumber(left, right);
}

function getOfficialRemainingMinutes(seat) {
  const value = seat.remainingMinutes ?? seat.raw?.remainingTime;
  if (value == null || String(value).trim() === "") {
    return null;
  }

  const remainingMinutes = Number(value);
  return Number.isFinite(remainingMinutes) && remainingMinutes >= 0 ? remainingMinutes : null;
}

function getOfficialTimeLabel(seat) {
  if (seat.status === "unavailable") {
    return "공식값 사용 불가";
  }
  if (seat.status === "available") {
    return "공식값 사용 가능";
  }

  const remainingMinutes = getOfficialRemainingMinutes(seat);
  if (remainingMinutes !== null) {
    return `공식값 ${remainingMinutes}분`;
  }

  return "공식값 없음";
}

function getFetchedAtLabel(seat) {
  const fetchedAt = seat.fetchedAt ? new Date(seat.fetchedAt) : null;
  if (!fetchedAt || Number.isNaN(fetchedAt.getTime())) {
    return "";
  }

  return `조회 ${fetchedAt.toLocaleTimeString("ko-KR")}`;
}

// 쉼표·공백으로 구분한 좌석 번호. "013"과 "13"은 같은 좌석으로 처리함
function getSeatFilter() {
  return new Set(seatFilterInput.value.split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isInteger));
}

function renderSeatList() {
  const filter = getSeatFilter();
  const seats = filter.size > 0 ? latestSeats.filter((seat) => filter.has(getSeatNumber(seat))) : latestSeats;
  seatList.replaceChildren();
  seatCount.textContent = filter.size > 0 ? `${seats.length}/${latestSeats.length}개` : `${latestSeats.length}개`;

  if (seats.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = latestSeats.length > 0 ? "검색한 좌석이 없습니다." : "표시할 좌석이 없습니다.";
    seatList.append(empty);
    return;
  }

  for (const seat of [...seats].sort(compareSeats)) {
    const remainingMs = getCurrentRemainingMs(seat);
    const isCooldown = isCoolingDown(seat);
    const isAvailable = seat.status === "available" && !isCooldown;
    const isUnavailable = seat.status === "unavailable";

    const row = document.createElement("div");
    row.className = `seat-row ${isAvailable ? "available" : isCooldown ? "cooldown" : isUnavailable ? "unavailable" : ""}`;

    const meta = document.createElement("div");
    meta.className = "seat-meta";

    const name = document.createElement("div");
    name.className = "seat-name";
    name.textContent = `${seat.roomName ?? `열람실 ${seat.roomNo}`} / ${seat.seatNo}번`;

    const detail = document.createElement("div");
    detail.className = "seat-detail";
    const statusLabel = isCooldown ? "반납 후 대기" : seat.statusLabel ?? "조회됨";
    detail.textContent = [statusLabel, getFetchedAtLabel(seat)].filter(Boolean).join(" · ");

    const time = document.createElement("div");
    time.className = "time-cell";

    const remaining = document.createElement("strong");
    remaining.textContent = isAvailable
      ? "사용 가능"
      : isCooldown
        ? `${formatRemaining(remainingMs)} 후 사용 가능 예상`
        : isUnavailable ? "사용 불가" : formatRemaining(remainingMs);

    const official = document.createElement("span");
    official.textContent = getOfficialTimeLabel(seat);

    meta.append(name, detail);
    time.append(remaining, official);
    row.append(meta, time);
    seatList.append(row);
  }
}

async function loadProviderStatus() {
  try {
    const providerState = await requestJson("/api/status");
    providerStatus.textContent = providerState.message ?? `provider: ${providerState.provider}`;
    providerStatus.className = `provider-status ${providerState.provider === "real" ? "real" : "mock"}`;
  } catch (error) {
    providerStatus.textContent = `연동 상태 확인 실패: ${error.message}`;
    providerStatus.className = "provider-status mock";
  }
}

function getRoomsValue() {
  return roomsInput.value.trim() || DEFAULT_ROOMS;
}

function getSeatKey(seat) {
  return JSON.stringify([String(seat.roomNo), String(seat.id ?? seat.seatNo)]);
}

function reconcileSeats(nextSeats) {
  const previousSeats = new Map(latestSeats.map((seat) => [getSeatKey(seat), seat]));

  return nextSeats.map((seat) => {
    const previousSeat = previousSeats.get(getSeatKey(seat));
    if (seat.status === "available") {
      // 반납 대기는 이 화면에서 사용 중 → 사용 가능 전환을 확인한 좌석에만 적용함
      const cooldownUntil = previousSeat?.status === "occupied"
        ? new Date(Date.now() + RETURN_COOLDOWN_MS).toISOString()
        : previousSeat?.cooldownUntil;
      return cooldownUntil ? { ...seat, cooldownUntil } : seat;
    }

    const remainingMinutes = getOfficialRemainingMinutes(seat);
    if (
      !previousSeat ||
      seat.status !== previousSeat.status ||
      remainingMinutes === null ||
      remainingMinutes !== getOfficialRemainingMinutes(previousSeat) ||
      !previousSeat.expiresAt ||
      !Number.isFinite(Date.parse(previousSeat.expiresAt))
    ) {
      return seat;
    }

    return { ...seat, expiresAt: previousSeat.expiresAt };
  });
}

async function fetchSeats() {
  if (isFetchingSeats || !isPageActive) {
    return;
  }
  isFetchingSeats = true;
  const rooms = getRoomsValue();
  const params = new URLSearchParams({ rooms });

  refreshButton.disabled = true;
  watchStatus.textContent = "좌석 현황을 조회하는 중입니다.";

  try {
    const data = await requestJson(`/api/seats?${params.toString()}`);
    latestSeats = reconcileSeats(data.seats ?? []);
    renderSeatList();
    watchStatus.textContent = `마지막 조회: ${new Date().toLocaleTimeString("ko-KR")}`;
  } catch (error) {
    renderSeatList();
    watchStatus.textContent = `조회 실패: ${error.message}`;
  } finally {
    isFetchingSeats = false;
    refreshButton.disabled = false;
  }
}

function scheduleAutoRefresh() {
  window.clearInterval(autoRefreshTimer);
  autoRefreshTimer = null;

  const intervalMs = Number(settings.refreshIntervalMs ?? 10000);
  if (intervalMs > 0) {
    autoRefreshTimer = window.setInterval(fetchSeats, intervalMs);
  }
}

settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveSettings({
    rooms: getRoomsValue(),
    refreshIntervalMs: Number(refreshIntervalInput.value),
  });
  scheduleAutoRefresh();
  fetchSeats();
});

refreshButton.addEventListener("click", () => {
  fetchSeats();
});

seatFilterInput.addEventListener("input", renderSeatList);

refreshIntervalInput.addEventListener("change", () => {
  saveSettings({
    rooms: getRoomsValue(),
    refreshIntervalMs: Number(refreshIntervalInput.value),
  });
  scheduleAutoRefresh();
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const headersText = headersTextInput.value.trim();
  if (!headersText) {
    headersTextInput.focus();
    return;
  }

  authStatus.textContent = "세션을 저장하는 중입니다.";

  try {
    const result = await requestJson("/api/import-headers", {
      method: "POST",
      body: JSON.stringify({ headersText }),
    });
    headersTextInput.value = "";
    authStatus.textContent = `저장됨: 쿠키 ${result.cookieNames.length}개, 토큰 ${result.authToken ? "있음" : "없음"}`;
    await loadProviderStatus();
    await fetchSeats();
  } catch (error) {
    authStatus.textContent = `저장 실패: ${error.message}`;
  }
});

applySettingsToForm();
loadProviderStatus();
fetchSeats();
scheduleAutoRefresh();
liveRenderTimer = window.setInterval(renderSeatList, 1000);

window.addEventListener("pagehide", () => {
  isPageActive = false;
  window.clearInterval(autoRefreshTimer);
  window.clearInterval(liveRenderTimer);
});

window.addEventListener("pageshow", () => {
  if (isPageActive) {
    return;
  }
  isPageActive = true;
  scheduleAutoRefresh();
  liveRenderTimer = window.setInterval(renderSeatList, 1000);
  fetchSeats();
});
