// In-app scheduler for Google Sheets sync (the app runs as one long-lived Node server on Railway).
// Checks every minute; each source syncs when its interval (Settings, default 15 minutes) has elapsed.
// A Postgres advisory lock keeps two instances from syncing at once. `npm run sync:tick` runs the same check by hand or from cron.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.DISABLE_SCHEDULER === '1') return;
  const { syncDue } = await import('./lib/server/google-sync');
  const tick = async () => {
    try {
      const r = await syncDue();
      if (r.ran) console.log(`[sync] ran ${r.ran} source(s)`);
    } catch (err) {
      console.error('[sync] tick failed:', (err as Error).message);
    }
  };
  setTimeout(tick, 30_000);
  setInterval(tick, 60_000).unref();
}
