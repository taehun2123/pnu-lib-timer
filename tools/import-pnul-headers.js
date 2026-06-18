#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const inputPath = process.argv[2];
const input = inputPath ? fs.readFileSync(inputPath, "utf8") : fs.readFileSync(0, "utf8");
const cookie = extractHeader(input, "cookie");
const authToken = extractHeader(input, "pyxis-auth-token");
const privateDir = path.join(__dirname, "..", "private");

if (!cookie) {
  console.error("cookie header not found");
  process.exit(1);
}

fs.mkdirSync(privateDir, { recursive: true });
fs.writeFileSync(path.join(privateDir, "pnul-cookie.txt"), cookie, { mode: 0o600 });

if (authToken) {
  fs.writeFileSync(path.join(privateDir, "pnul-auth-token.txt"), authToken, { mode: 0o600 });
}

console.log("saved private/pnul-cookie.txt");
console.log(`pyxis-auth-token: ${authToken ? "saved" : "not present; will try deriving from PUSAN_PYXIS3"}`);

function extractHeader(text, name) {
  const lowerName = name.toLowerCase();
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const lowerLine = line.toLowerCase();

    if (lowerLine === lowerName) {
      return readNextValue(lines, index + 1);
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

function readNextValue(lines, startIndex) {
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line) {
      return line;
    }
  }

  return "";
}
