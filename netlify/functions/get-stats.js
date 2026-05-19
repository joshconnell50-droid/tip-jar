// netlify/functions/get-stats.js
// Public read endpoint. Returns the current tip jar stats as JSON.
// The frontend hits this on page load and every few seconds.

import { getStore } from "@netlify/blobs";

export default async () => {
  const store = getStore("tipjar");

  const stats = (await store.get("stats", { type: "json" })) || {
    totalCents: 0,
    tipCount: 0,
    countries: [],
    lastTipAt: null,
    lastTipCountry: null,
  };

  // Shape the response so the frontend doesn't have to do math.
  const body = {
    totalDollars: (stats.totalCents / 100).toFixed(2),
    tipCount: stats.tipCount,
    countryCount: stats.countries.length,
    lastTipAt: stats.lastTipAt,
    lastTipCountry: stats.lastTipCountry,
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // No cache — we want fresh numbers on every fetch, especially after a tip.
      "Cache-Control": "no-store, max-age=0",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

export const config = {
  path: "/api/stats",
};
