/**
 * Enforcement script: scan-secrets
 *
 * Scans all TypeScript source files for hardcoded credential patterns.
 * If any are found, exits with code 1 — blocking the commit.
 *
 * This is a simplified version of a real enforcement script.
 * Run: npx tsx src/scan-secrets.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SECRET_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: "Stripe key", regex: /["'](sk[-_]live[-_])[a-zA-Z0-9]{10,}["']/g },
  { label: "AWS access key", regex: /["'](AKIA)[A-Z0-9]{12,}["']/g },
  { label: "GitHub PAT", regex: /["'](ghp_)[a-zA-Z0-9]{30,}["']/g },
  { label: "Slack token", regex: /["'](xoxb[-_])[a-zA-Z0-9-]{20,}["']/g }
];

const thisFile = fileURLToPath(import.meta.url);
const srcDir = path.dirname(thisFile);
const files = fs
  .readdirSync(srcDir)
  .filter((f) => f.endsWith(".ts") && f !== path.basename(thisFile));

let violations = 0;

for (const file of files) {
  const content = fs.readFileSync(path.join(srcDir, file), "utf-8");
  const lines = content.split("\n");

  for (const { label, regex } of SECRET_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const matches = lines[i].matchAll(new RegExp(regex));
      for (const match of matches) {
        violations++;
        const preview =
          match[0].length > 24 ? match[0].slice(0, 24) + "…" : match[0];
        console.error(
          `  ERROR  ${file}:${i + 1}  ${label} detected → ${preview}`
        );
      }
    }
  }
}

console.log();
if (violations > 0) {
  console.error(
    `FAILED: ${violations} hardcoded credential(s) found.\n` +
      `Move secrets to environment variables.\n`
  );
  process.exit(1);
} else {
  console.log("PASSED: no hardcoded credentials detected.\n");
}
