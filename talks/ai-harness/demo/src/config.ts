/**
 * Configuration for the notification service.
 *
 * DEMO: this file compiles fine. TypeScript is happy. The linter is happy.
 * But run `npx tsx src/scan-secrets.ts` and watch what happens.
 */

export const config = {
  baseUrl: "https://api.example.com/v2",
  apiKey: "sk-live-abc123def456ghi789jkl012mno345pqr678",
  timeout: 30_000,
  retries: 3
};
