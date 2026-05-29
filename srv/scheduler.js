const cds = require('@sap/cds');
const cron = require('node-cron');
const LOG = cds.log('scheduler');

/**
 * TRE Scheduler (Cron-based)
 * ───────────────────────────
 * Bootstraps once all CDS services are ready (cds.on('served')).
 *
 * Behaviour:
 *  1. Reads the first *active* SchedulerConfig row.
 *  2. Fires loadFailedIdocHeaders immediately (first load on startup).
 *  3. Sets up a cron job to repeat based on `intervalHours`.
 *  4. If SchedulerConfig changes in the DB, restart() must be called again
 *     (or restart the app — acceptable for now).
 */

let _cronTask = null; // hold reference so we can stop on restart

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

    if (!svc) {
      LOG.error('[Scheduler] FailedIdocService is undefined or not found.');
      return;
    }

    const result = await svc.send('loadFailedIdocHeaders');

    LOG.info(
      `[Scheduler] loadFailedIdocHeaders completed → loaded=${result?.loaded}, status=${result?.status}`
    );

    LOG.info(`[Scheduler] loadFailedIdocHeaders completed → loaded=${result?.loaded}, status=${result?.status}`);
  } catch (err) {
    LOG.error('[Scheduler] loadFailedIdocHeaders failed:', err.message, err.stack);
  }
}

/**
 * Internal: read SchedulerConfig and start the cron job
 */
async function startScheduler() {
  // Stop any previous cron task
  if (_cronTask) {
    _cronTask.stop();
    _cronTask.destroy();
    _cronTask = null;
  }

  try {
    LOG.info('[Scheduler] Attempting to connect to database …');

    // Use a root/system-level DB transaction (no user context needed)
    const db = await cds.connect.to('db');

    if (!db) {
      LOG.error('[Scheduler] Database connection failed — db is undefined.');
      return;
    }

    LOG.info('[Scheduler] Database connected. Loading SchedulerConfig …');

    const { SchedulerConfig } = cds.entities('ZTR_Backend_1');

    if (!SchedulerConfig) {
      LOG.error('[Scheduler] SchedulerConfig entity not found in cds.entities.');
      return;
    }

    const config = await db.run(
      SELECT.one.from(SchedulerConfig).where({ active: true })
    );

    if (!config) {
      LOG.warn('[Scheduler] No active SchedulerConfig found — scheduler will NOT run.');
      return;
    }

    LOG.info(`[Scheduler] Config loaded: ${JSON.stringify(config)}`);

    const intervalHours = Number.isInteger(config.intervalHours) && config.intervalHours > 0
      ? config.intervalHours
      : 1;

    // Build cron expression: every N hours at minute 0
    // Format: second minute hour day month day-of-week
    // "0 */N * * * *" = at second 0, minute 0, every N hours
    const cronExpression = `0 0 */${intervalHours} * * *`;

    LOG.info(`[Scheduler] Active config found: schedulerName="${config.schedulerName}", interval=${intervalHours}h, cron="${cronExpression}"`);

    // ── 1. Immediate first run on startup ──────────────────────────────
    LOG.info('[Scheduler] Starting initial load …');
    await runLoad();

    // ── 2. Recurring cron job ──────────────────────────────────────────
    _cronTask = cron.schedule(cronExpression, async () => {
      LOG.info('[Scheduler] Cron job fired — running scheduled load …');
      await runLoad();
    });

    LOG.info(`[Scheduler] Cron job scheduled: next run in ~${intervalHours} hour(s).`);

  } catch (err) {
    LOG.error('[Scheduler] Failed to start scheduler:', err.message, err.stack);
  }
}

/**
 * Hook into CDS lifecycle — wait until all services are served
 */
cds.on('served', async () => {
  LOG.info('[Scheduler] ✓ CDS services ready — initialising TRE scheduler …');
  LOG.info('[Scheduler] Delaying 3 seconds to allow DB connections to stabilise …');

  // Small delay to allow DB connections to stabilise on CF startup
  setTimeout(() => {
    LOG.info('[Scheduler] Calling startScheduler after delay …');
    startScheduler().catch(err => {
      LOG.error('[Scheduler] startScheduler threw uncaught error:', err.message, err.stack);
    });
  }, 3000);
});

module.exports = { startScheduler, runLoad };
