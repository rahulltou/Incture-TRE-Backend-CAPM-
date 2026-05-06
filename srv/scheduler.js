const cds = require('@sap/cds');
const LOG = cds.log('scheduler');

/**
 * TRE Scheduler
 * ─────────────
 * Bootstraps once all CDS services are ready (cds.on('served')).
 *
 * Behaviour:
 *  1. Reads the first *active* SchedulerConfig row.
 *  2. Fires loadFailedIdocHeaders immediately (first load on startup).
 *  3. Sets up setInterval to repeat every `intervalHours` hours.
 *  4. If SchedulerConfig changes in the DB, restart() must be called again
 *     (or restart the app — acceptable for now).
 */

let _timer = null; // hold reference so we can clear on restart

/**
 * Internal: run the action programmatically via the CAP service API.
 *
 * Uses cds.User.Privileged so this background job bypasses ALL @requires
 * role checks — internal/scheduled calls should never be subject to
 * user-facing XSUAA role restrictions.
 */
async function runLoad() {
  try {
    LOG.info('[Scheduler] Triggering loadFailedIdocHeaders …');

    const svc = await cds.connect.to('FailedIdocService');

    // Run in a privileged system context — no user token needed
    const result = await cds.tx(
      { user: new cds.User.Privileged() },
      async (tx) => {
        return tx.send({ to: svc, event: 'loadFailedIdocHeaders', data: {} });
      }
    );

    LOG.info(`[Scheduler] loadFailedIdocHeaders completed → loaded=${result?.loaded}, status=${result?.status}`);
  } catch (err) {
    LOG.error('[Scheduler] loadFailedIdocHeaders failed:', err.message);
  }
}

/**
 * Internal: read SchedulerConfig and start the interval timer
 */
async function startScheduler() {
  // Clear any previous timer
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }

  try {
    // Use a root/system-level DB transaction (no user context needed)
    const db = await cds.connect.to('db');
    const { SchedulerConfig } = cds.entities('ZTR_Backend_1');

    const config = await db.run(
      SELECT.one.from(SchedulerConfig).where({ active: true })
    );

    if (!config) {
      LOG.warn('[Scheduler] No active SchedulerConfig found — scheduler will NOT run.');
      return;
    }

    const intervalHours = config.intervalHours || 1;
    const intervalMs = intervalHours * 60 * 60 * 1000;

    LOG.info(`[Scheduler] Active config found: schedulerName="${config.schedulerName}", interval=${intervalHours}h`);

    // ── 1. Immediate first run on startup ──────────────────────────────
    await runLoad();

    // ── 2. Recurring job ───────────────────────────────────────────────
    _timer = setInterval(async () => {
      await runLoad();
    }, intervalMs);

    LOG.info(`[Scheduler] Next run scheduled in ${intervalHours} hour(s).`);

  } catch (err) {
    LOG.error('[Scheduler] Failed to start scheduler:', err.message);
  }
}

/**
 * Hook into CDS lifecycle — wait until all services are served
 */
cds.on('served', async () => {
  LOG.info('[Scheduler] CDS services ready — initialising TRE scheduler …');
  // Small delay to allow DB connections to stabilise on CF startup
  setTimeout(startScheduler, 3000);
});

module.exports = { startScheduler, runLoad };
