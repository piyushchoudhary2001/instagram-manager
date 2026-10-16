import fs from "node:fs";
import path from "node:path";

/**
 * Loads .env.local for the command-line scripts. Next does this itself for the app; the
 * scripts run outside it, so they need their own one-line reader.
 *
 * Values stay in process.env and are never printed.
 */
export function config(files = [".env.local", ".env"]): void {
  for (const name of files) {
    const file = path.join(process.cwd(), name);
    let raw: string;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (value && process.env[key] === undefined) process.env[key] = value;
    }
  }
}
