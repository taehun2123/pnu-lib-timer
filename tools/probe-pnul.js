#!/usr/bin/env node

const fs = require("node:fs");

const BASE_URL = "https://lib.pusan.ac.kr/pyxis-api/1";
const COOKIE_FILE = process.env.PNUL_COOKIE_FILE;
const AUTH_TOKEN_FILE = process.env.PNUL_AUTH_TOKEN_FILE;
const RAW_COOKIE = process.env.PNUL_COOKIE ?? readCookieFile(COOKIE_FILE);
const COOKIE = normalizeCookie(RAW_COOKIE);
const AUTHORIZATION = process.env.PNUL_AUTHORIZATION ?? "";
const PYXIS_AUTH_TOKEN = process.env.PNUL_AUTH_TOKEN ?? readTokenFile(AUTH_TOKEN_FILE) ?? deriveAuthToken(COOKIE);

const rooms = [
  { id: 7, name: "새벽별당[24h]-A" },
  { id: 8, name: "새벽별당[24h]-B" },
  { id: 69, name: "1열람실" },
];

async function getJson(path) {
  const headers = {
    Accept: "application/json, text/plain, */*",
    Referer: "https://lib.pusan.ac.kr/facility/seat/reading-rooms-for-reservation",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  };
  if (COOKIE) headers.Cookie = COOKIE;
  if (AUTHORIZATION) headers.Authorization = AUTHORIZATION;
  if (PYXIS_AUTH_TOKEN) headers["pyxis-auth-token"] = PYXIS_AUTH_TOKEN;

  const response = await fetch(`${BASE_URL}${path}`, {
    headers,
  });
  const body = await response.text();

  try {
    return {
      status: response.status,
      json: JSON.parse(body),
    };
  } catch {
    return {
      status: response.status,
      text: body,
    };
  }
}

function normalizeCookie(input) {
  return input
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^cookie:\s*/i, ""))
    .join("; ")
    .replace(/;\s*;/g, ";")
    .trim();
}

function readCookieFile(filePath) {
  if (!filePath) {
    return "";
  }

  if (!fs.existsSync(filePath)) {
    return "";
  }

  return fs.readFileSync(filePath, "utf8");
}

function readTokenFile(filePath) {
  if (!filePath) {
    return "";
  }

  if (!fs.existsSync(filePath)) {
    return "";
  }

  return fs.readFileSync(filePath, "utf8").trim();
}

function getCookieNames(cookie) {
  return cookie
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split("=")[0].trim())
    .filter(Boolean);
}

function getCookieValue(cookie, name) {
  const prefix = `${name}=`;
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

function deriveAuthToken(cookie) {
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

function printCookieDiagnostics() {
  const names = getCookieNames(COOKIE);
  console.log(`cookie: ${COOKIE ? "provided" : "not provided"}`);
  console.log(`pyxis-auth-token: ${PYXIS_AUTH_TOKEN ? "provided/derived" : "not found"}`);
  if (!COOKIE) return;

  console.log(`cookie names: ${names.join(", ")}`);

  const missing = ["PUSAN_PYXIS3", "PUSAN_PYXIS3_SS"].filter((name) => !names.includes(name));
  if (missing.length > 0) {
    console.log(`missing likely required cookie(s): ${missing.join(", ")}`);
  }

  if (COOKIE.includes("\t") || COOKIE.includes("\n")) {
    console.log("warning: cookie contains tab/newline characters; copy the raw Cookie request header if this fails.");
  }
}

function summarizeSeatCharge(result) {
  const list = result.json?.data?.list;
  if (!Array.isArray(list)) return result;

  return {
    status: result.status,
    success: result.json.success,
    count: list.length,
    ids: list.slice(0, 5).map((item) => item.id),
  };
}

async function main() {
  console.log("PNUL seat API probe");
  printCookieDiagnostics();

  const summary = await getJson("/seat-rooms?smufMethodCode=PC&branchId=2&buildingId=2&floor=2");
  console.log("\n[GET] /seat-rooms");
  console.dir(summary, { depth: 5 });

  const dates = await getJson("/seat-room-reservable-dates?smufMethodCode=PC&branchId=2&buildingId=2&floor=2");
  console.log("\n[GET] /seat-room-reservable-dates");
  console.dir(dates, { depth: 5 });

  const charges = await getJson("/api/seat-charges");
  console.log("\n[GET] /api/seat-charges (login check)");
  console.dir(summarizeSeatCharge(charges), { depth: 5 });

  for (const room of rooms) {
    const seats = await getJson(`/api/rooms/${room.id}/seats`);
    console.log(`\n[GET] /api/rooms/${room.id}/seats (${room.name})`);
    if (seats.json?.data?.list) {
      console.dir(
        {
          status: seats.status,
          success: seats.json.success,
          count: seats.json.data.list.length,
          first: seats.json.data.list[0],
        },
        { depth: 5 },
      );
    } else {
      console.dir(seats, { depth: 5 });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
