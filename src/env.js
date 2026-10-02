import fs from "node:fs";
import path from "node:path";

function unquote(value) {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}

export function loadLocalEnv(filePath = path.resolve(process.cwd(), ".env")) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = unquote(line.slice(separator + 1).trim());
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
