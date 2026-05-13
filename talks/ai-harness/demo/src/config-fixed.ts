/**
 * Configuration for the notification service — secret removed.
 *
 * DEMO: copy this over config.ts, re-run the scan, and watch it pass.
 */

export const config = {
  baseUrl: "https://api.example.com/v2",
  apiKey: process.env.API_KEY ?? "",
  timeout: 30_000,
  retries: 3
};
