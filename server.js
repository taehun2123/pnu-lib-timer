const http = require("node:http");
const fs = require("node:fs");
const { URL } = require("node:url");

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 4173);
const USE_MOCK = process.env.PNUSEAR_PROVIDER !== "real";
const PNUL_BASE_URL = "https://lib.pusan.ac.kr/pyxis-api/1";
const PNUL_COOKIE_FILE = process.env.PNUL_COOKIE_FILE;
const PNUL_AUTH_TOKEN_FILE = process.env.PNUL_AUTH_TOKEN_FILE;
const PRIVATE_DIR = `${__dirname}/private`;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const REAL_ROOMS = new Map([
  [7, "새벽별당[24h]-A"],
  [8, "새벽별당[24h]-B"],
  [69, "1열람실"],
]);

const EXCLUDED_SEATS = new Map([
  [7, new Set(["98", "99", "100", "101"])],
  [8, new Set(["146", "147"])],
  [69, new Set(["363"])],
]);

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function mockSeats(roomNo) {
  const now = Date.now();
  return [55, 88, 140, 205, 360, 720, 830, 910].map((seconds, index) => ({
    roomNo,
    roomName: roomNo,
    seatNo: 120 + index,
    status: "occupied",
    statusLabel: "사용중",
    expiresAt: new Date(now + seconds * 1000).toISOString(),
    fetchedAt: new Date(now).toISOString(),
    remainingMinutes: Math.ceil(seconds / 60),
    remainingMs: seconds * 1000,
  }));
}

function normalizeCookie(input) {
  return String(input ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^cookie:\s*/i, ""))
    .join("; ")
    .replace(/;\s*;/g, ";")
    .trim();
}

function getPnulCookie() {
  if (process.env.PNUL_COOKIE) {
    return normalizeCookie(process.env.PNUL_COOKIE);
  }

  if (PNUL_COOKIE_FILE && fs.existsSync(PNUL_COOKIE_FILE)) {
    return normalizeCookie(fs.readFileSync(PNUL_COOKIE_FILE, "utf8"));
  }

  return "";
}

function getPnulAuthToken(cookie) {
  if (process.env.PNUL_AUTH_TOKEN) {
    return process.env.PNUL_AUTH_TOKEN.trim();
  }

  if (PNUL_AUTH_TOKEN_FILE && fs.existsSync(PNUL_AUTH_TOKEN_FILE)) {
    return fs.readFileSync(PNUL_AUTH_TOKEN_FILE, "utf8").trim();
  }

  const rawAuthCookie = getCookieValue(cookie, "PUSAN_PYXIS3");
  if (!rawAuthCookie) {
    return "";
  }

  try {
    const authInfo = JSON.parse(decodeURIComponent(rawAuthCookie));
    return authInfo.accessToken ?? "";
  } catch {
    return "";
  }
}

function getCookieValue(cookie, name) {
  const prefix = `${name}=`;
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

function getCookieNames(cookie) {
  return cookie
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split("=")[0].trim())
    .filter(Boolean);
}

function extractHeader(text, name) {
  const lowerName = name.toLowerCase();
  const lines = String(text ?? "").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const lowerLine = line.toLowerCase();

    if (lowerLine === lowerName) {
      return readNextHeaderValue(lines, index + 1);
    }

    const headerMatch = line.match(/^([^:]+):\s*(.+)$/);
    if (headerMatch && headerMatch[1].trim().toLowerCase() === lowerName) {
      return headerMatch[2].trim();
    }

    const curlHeaderMatch = line.match(/^-H\s+['"]([^:]+):\s*(.+)['"]\s*\\?$/);
    if (curlHeaderMatch && curlHeaderMatch[1].trim().toLowerCase() === lowerName) {
      return curlHeaderMatch[2].trim();
    }
  }

  return "";
}

function readNextHeaderValue(lines, startIndex) {
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line) {
      return line;
    }
  }

  return "";
}

function savePnulHeaders(headersText) {
  const cookie = extractHeader(headersText, "cookie");
  const authToken = extractHeader(headersText, "pyxis-auth-token") || getPnulAuthToken(cookie);
  if (!cookie) {
    throw new Error("Cookie 헤더를 찾지 못했습니다.");
  }

  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  fs.writeFileSync(`${PRIVATE_DIR}/pnul-cookie.txt`, cookie, { mode: 0o600 });
  if (authToken) {
    fs.writeFileSync(`${PRIVATE_DIR}/pnul-auth-token.txt`, authToken, { mode: 0o600 });
  }

  return {
    cookieNames: getCookieNames(cookie),
    authToken: Boolean(authToken),
  };
}

function resolveRoomIds(roomNo) {
  const raw = String(roomNo ?? "").trim();
  if (!raw) {
    return [];
  }

  if (/^\d+$/.test(raw)) {
    return [Number(raw)];
  }

  if (raw.includes("새벽별당") || raw.toLowerCase().includes("star")) {
    return [7, 8];
  }

  if (raw.includes("1열람실") || raw.includes("제1열람실")) {
    return [69];
  }

  return [];
}

function parsePnulDate(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function findTimeValue(value, depth = 0) {
  if (!value || depth > 3 || typeof value !== "object") {
    return null;
  }

  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string" && /(expire|expired|end|return|due|until|finish|close)/i.test(key)) {
      const date = parsePnulDate(child);
      if (date) {
        return date;
      }
    }
  }

  for (const child of Object.values(value)) {
    const date = findTimeValue(child, depth + 1);
    if (date) {
      return date;
    }
  }

  return null;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function normalizeSeatNo(value) {
  const raw = String(value ?? "").trim();
  return raw.replace(/^0+(?=\d)/, "");
}

function isExcludedSeat(roomId, seatNo) {
  return EXCLUDED_SEATS.get(roomId)?.has(normalizeSeatNo(seatNo)) ?? false;
}

function getRemainingMs(seat) {
  const remainingTime = Number(seat.remainingTime);
  if (Number.isFinite(remainingTime) && remainingTime >= 0) {
    return remainingTime * 60 * 1000;
  }

  return null;
}

function normalizePnulSeat(roomId, seat, fetchedAt) {
  const unavailable = seat.isActive === false || seat.isUnavailable === true || seat.isDisabled === true;
  const occupied = seat.isOccupied === true;
  const reservable = seat.isReservable ?? seat.showReservationButton;
  const available = !unavailable && !occupied && (
    reservable === true || (reservable == null && seat.isOccupied === false)
  );
  const cooldown = !unavailable && seat.isOccupied === false && reservable === false;
  const status = unavailable ? "unavailable" : occupied ? "occupied" : available ? "available" : cooldown ? "cooldown" : "unknown";
  const statusLabel = {
    unavailable: "사용 불가",
    occupied: "사용중",
    available: "사용 가능",
    cooldown: "반납 후 대기",
    unknown: "조회됨",
  }[status];
  const remainingMsFromApi = getRemainingMs(seat);
  const expiresAtDate = cooldown || unavailable
    ? null
    : available
      ? fetchedAt
      : remainingMsFromApi !== null
        ? new Date(fetchedAt.getTime() + remainingMsFromApi)
        : findTimeValue(seat);
  const remainingMs = cooldown || unavailable
    ? null
    : available
      ? 0
      : remainingMsFromApi !== null
        ? remainingMsFromApi
        : expiresAtDate
          ? Math.max(0, expiresAtDate.getTime() - Date.now())
          : null;
  const seatNo = firstDefined(
    seat.no,
    seat.seatNo,
    seat.seatNumber,
    seat.number,
    seat.name,
    seat.code,
    seat.id,
  );

  return {
    id: seat.id,
    roomNo: roomId,
    roomName: REAL_ROOMS.get(roomId) ?? `열람실 ${roomId}`,
    seatNo,
    status,
    statusLabel,
    expiresAt: expiresAtDate?.toISOString() ?? null,
    fetchedAt: fetchedAt.toISOString(),
    remainingMinutes: Number.isFinite(Number(seat.remainingTime)) ? Number(seat.remainingTime) : null,
    remainingMs,
    raw: {
      isActive: seat.isActive,
      isUnavailable: seat.isUnavailable,
      isDisabled: seat.isDisabled,
      isOccupied: seat.isOccupied,
      isReservable: seat.isReservable,
      showReservationButton: seat.showReservationButton,
      remainingTime: seat.remainingTime,
      chargeTime: seat.chargeTime,
      seatChargeState: seat.seatChargeState,
    },
  };
}

async function pnulGet(path) {
  const cookie = getPnulCookie();
  if (!cookie) {
    throw new Error("PNUL_COOKIE_FILE 또는 PNUL_COOKIE가 설정되지 않았습니다.");
  }
  const authToken = getPnulAuthToken(cookie);
  if (!authToken) {
    throw new Error("pyxis-auth-token을 찾지 못했습니다. PUSAN_PYXIS3 쿠키 또는 PNUL_AUTH_TOKEN이 필요합니다.");
  }

  const response = await fetch(`${PNUL_BASE_URL}${path}`, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Cookie: cookie,
      Referer: "https://lib.pusan.ac.kr/facility/seat/reading-rooms-for-reservation",
      "pyxis-auth-token": authToken,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
    },
  });
  const body = await response.text();

  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`PNUL returned non-JSON response: HTTP ${response.status}`);
  }
}

async function listSeats(roomNo) {
  if (USE_MOCK) {
    return mockSeats(roomNo);
  }

  const roomIds = resolveRoomIds(roomNo);
  if (roomIds.length === 0) {
    throw new Error(`지원하지 않는 열람실입니다: ${roomNo}`);
  }

  const results = [];
  for (const roomId of roomIds) {
    const fetchedAt = new Date();
    const data = await pnulGet(`/api/rooms/${roomId}/seats`);
    if (!data.success) {
      throw new Error(`${REAL_ROOMS.get(roomId) ?? roomId}: ${data.code ?? data.message ?? "조회 실패"}`);
    }

    const seats = data.data?.list ?? [];
    results.push(
      ...seats
        .map((seat) => normalizePnulSeat(roomId, seat, fetchedAt))
        .filter((seat) => !isExcludedSeat(roomId, seat.seatNo)),
    );
  }

  return results;
}

async function routeApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/status") {
    const cookie = getPnulCookie();
    const hasCookie = Boolean(cookie);
    const hasAuthToken = Boolean(cookie && getPnulAuthToken(cookie));
    sendJson(response, 200, {
      provider: USE_MOCK ? "mock" : "real",
      message: USE_MOCK
        ? "MOCK 모드: 실제 좌석 조회 아님"
        : hasCookie && hasAuthToken
          ? "REAL 조회 모드: PNUL 좌석 남은 시간 조회"
          : hasCookie
            ? "REAL 조회 모드: pyxis-auth-token 필요"
            : "REAL 조회 모드: PNUL_COOKIE_FILE 또는 PNUL_COOKIE 필요",
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/seats") {
    const rooms = url.searchParams.get("rooms");
    const roomNo = url.searchParams.get("roomNo");
    if (!rooms && !roomNo) {
      sendJson(response, 400, { error: "rooms or roomNo is required" });
      return;
    }

    const roomList = rooms ? rooms.split(",").map((room) => room.trim()).filter(Boolean) : [roomNo];
    const seats = (await Promise.all(roomList.map((room) => listSeats(room)))).flat();
    sendJson(response, 200, { seats });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/import-headers") {
    const payload = JSON.parse((await readBody(request)) || "{}");
    const result = savePnulHeaders(payload.headersText);
    sendJson(response, 200, result);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

async function routeStatic(request, response, url) {
  const fs = require("node:fs/promises");
  const path = require("node:path");

  const relativePath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.join(__dirname, path.normalize(relativePath));

  if (!filePath.startsWith(__dirname)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    response.writeHead(200, { "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream" });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await routeApi(request, response, url);
      return;
    }

    await routeStatic(request, response, url);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`PNUSear listening on http://${HOST}:${PORT}`);
  console.log(`Seat provider: ${USE_MOCK ? "mock" : "real"}`);
});
