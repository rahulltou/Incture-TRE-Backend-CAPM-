/**
 * Custom CAP server entry point (server.js)
 * ──────────────────────────────────────────
 * CAP automatically picks this file up if it exists in the project root.
 * We use it to bootstrap the TRE Scheduler module alongside the default server.
 *
 * The scheduler module registers itself via cds.on('served', …) so no
 * explicit call is needed here — importing the module is enough.
 */
require('./srv/scheduler'); // register scheduler lifecycle hook

// Delegate to the default CDS server bootstrap
const cds = require('@sap/cds');
const cors = require('cors');

cds.on('bootstrap', app => {
    app.use(cors({
        origin: true,       // Reflects the request origin, allowing all origins
        credentials: true   // Allows cookies and authorization headers
    }));
});

module.exports = cds.server;
