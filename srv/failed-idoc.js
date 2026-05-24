const cds = require('@sap/cds');
const LOG = cds.log('failed-idoc');

/**
 * Toggle:
 *  - true  → mock EDIDC data (local dev, set USE_MOCK_FAILED_IDOC=true)
 *  - false → real SAP OData via BTP Destination (CF production)
 */
const USE_MOCK_FAILED_IDOC = process.env.USE_MOCK_FAILED_IDOC === 'true';

module.exports = cds.service.impl(async function () {

  const {
    FailedIdocHeaders,
    FailedIdocItems,
    MessageTypesForMetadata,
    ErrorCodes
  } = cds.entities('ZTR_Backend_1');

  // Convert SAP /Date(1738281600000)/ to ISO string
  const parseODataDate = (d) => {
    if (!d) return d;
    if (typeof d === 'string' && d.startsWith('/Date(')) {
      const ms = parseInt(d.match(/\d+/)[0], 10);
      return new Date(ms).toISOString(); // Returns like "2025-01-31T00:00:00.000Z"
    }
    return d;
  };

  // Convert SAP PT10H30M20S to HH:MM:SS
  const parseODataTime = (t) => {
    if (!t) return t;
    if (typeof t === 'string' && t.startsWith('PT')) {
      const match = t.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (match) {
        const h = (match[1] || '0').padStart(2, '0');
        const m = (match[2] || '0').padStart(2, '0');
        const s = (match[3] || '0').padStart(2, '0');
        return `${h}:${m}:${s}`;
      }
    }
    return t;
  };

  /* ═══════════════════════════════════════════════════════════════
     ACTION: loadFailedIdocHeaders
     ───────────────────────────────────────────────────────────────
     1. Read active MessageTypesForMetadata + ErrorCodes config
     2. Group by systemAlias  → ONE OData call per SAP system
     3. For each system:
          a. Connect via dynamic BTP Destination (= systemAlias name)
          b. Fetch EDIDC rows
          c. Filter to configured message types + error codes
          d. Upsert into FailedIdocHeaders (insert new, update changed)
     Returns: { loaded: <count>, status: 'SUCCESS' | 'NO_CONFIG' }
  ═══════════════════════════════════════════════════════════════ */
  this.on('loadFailedIdocHeaders', async (req) => {

    /* ── 1. Read active configuration ──────────────────────────── */
    // In CAP 9, inside an action handler, use req directly for DB access
    // — CAP manages the transaction automatically via req context.
    const msgCfg = await SELECT.from(MessageTypesForMetadata).where({ active: true });
    const errCfg = await SELECT.from(ErrorCodes).where({ active: true });

    if (!msgCfg.length || !errCfg.length) {
      LOG.warn('[loadFailedIdocHeaders] No active config — aborting.');
      return { loaded: 0, status: 'NO_CONFIG' };
    }

    /* Error codes that qualify as "failed" — e.g. '51' */
    const validErrorCodes = new Set(errCfg.map(e => e.errorCode));

    /* Per-alias message type map: { sysAlias → Set<messageType> } */
    const msgTypesByAlias = {};
    for (const m of msgCfg) {
      if (!msgTypesByAlias[m.systemAlias]) msgTypesByAlias[m.systemAlias] = new Set();
      msgTypesByAlias[m.systemAlias].add(m.messageType);
    }

    /* ── 2. Deduplicate system aliases ──────────────────────────── */
    const systems = Object.keys(msgTypesByAlias);
    LOG.info(`[loadFailedIdocHeaders] Processing ${systems.length} system(s): ${systems.join(', ')}`);

    let totalLoaded = 0;

    /* ── 3. Process each SAP system ─────────────────────────────── */
    for (const sysAlias of systems) {
      try {
        let rows = [];
        let edidcSrv = null;

        if (USE_MOCK_FAILED_IDOC) {
          /* ── LOCAL DEV: inline mock data ──────────────────────── */
          rows = getMockEdidc();
          LOG.info(`[loadFailedIdocHeaders] [MOCK] system: ${sysAlias}`);

        } else {
          /* ── PRODUCTION: dynamic BTP Destination per systemAlias ──
           *
           * Each systemAlias value must match a BTP Destination name
           * configured in the Destination Service instance.
           *
           * We use a UNIQUE service key per alias so CAP does NOT
           * return a cached connection from a previous alias.
           * Format: "Corrected_Error_EDIDC__<alias>"
           */
          const serviceKey = `Corrected_Error_EDIDC__${sysAlias}`;

          LOG.info(`[loadFailedIdocHeaders] Connecting to ${sysAlias} via BTP destination …`);

          edidcSrv = await cds.connect.to(serviceKey, {
            kind: 'odata-v2',
            model: 'srv/external/Corrected_Error_EDIDC',
            credentials: {
              destination: sysAlias,
              path: '/sap/opu/odata/sap/ZIDOC_ERROR_REPROCESSING_SRV'
            }
          });

          rows = await edidcSrv.run(SELECT.from('EDIDCSet'));

          LOG.info(`[loadFailedIdocHeaders] Fetched ${rows.length} raw rows from ${sysAlias}`);
        }

        /* ── Filter: message type must be configured for this system
         *           AND status must be in ErrorCodes table.
         *   NOTE: We do NOT match r.SysAlias — SAP returns its internal
         *         system alias (e.g. S4HCLNT210) which is different from
         *         our BTP destination name (e.g. s4h-210-odata-basic).  */
        const allowedMsgTypes = msgTypesByAlias[sysAlias] || new Set();
        const filteredRows = rows.filter(r =>
          allowedMsgTypes.has(r.Mestyp) && validErrorCodes.has(r.Status)
        );

        LOG.info(`[loadFailedIdocHeaders] ${sysAlias}: ${filteredRows.length} rows after filter`);

        /* ── Upsert into FailedIdocHeaders ──────────────────────── */
        for (const r of filteredRows) {

          const exists = await SELECT.one.from(FailedIdocHeaders)
            .where({ docnum: r.Docnum, systemAlias: sysAlias });

          if (exists) {
            let updatePayload = {};
            
            /* Only update status if changed since last sync */
            if (exists.status !== r.Status) {
              updatePayload.status = r.Status;
              updatePayload.errorFlag = validErrorCodes.has(r.Status);
            }
            
            /* Backfill createdOn / createdTime if missing in DB but provided by SAP */
            if (!exists.createdOn && r.Credat) {
              updatePayload.createdOn = parseODataDate(r.Credat);
              updatePayload.createdTime = parseODataTime(r.Cretim);
            }

            if (Object.keys(updatePayload).length > 0) {
              await UPDATE(FailedIdocHeaders)
                .set(updatePayload)
                .where({ docnum: r.Docnum, systemAlias: sysAlias });
            }
            continue; // skip re-insert
          }

          const newHeaderId = cds.utils.uuid();

          await INSERT.into(FailedIdocHeaders).entries({
            ID: newHeaderId,
            docnum: r.Docnum,
            mestyp: r.Mestyp,
            idoctp: r.Idoctp,
            status: r.Status,
            landscape: r.Landscape,
            systemAlias: sysAlias, 
            createdOn: parseODataDate(r.Credat),
            createdTime: parseODataTime(r.Cretim),
            sender: r.Sndprn,
            receiver: r.Rcvprn,
            errorFlag: true,
            processingStatus: 'Failed'
          });
          totalLoaded++;

          /* ── Fetch and Store EDIDD Segments ───────────────────── */
          try {
            let ediddRows = [];
            if (USE_MOCK_FAILED_IDOC) {
              ediddRows = getMockEdidd(r.Docnum);
            } else if (edidcSrv) {
              ediddRows = await edidcSrv.run(SELECT.from('EDIDDSet').where({ Docnum: r.Docnum }));
            }

            const itemsToInsert = ediddRows.map(item => ({
              parent_ID: newHeaderId,
              docnum: item.Docnum,
              segnum: item.Segnum,
              segnam: item.Segnam,
              psgnum: item.Psgnum,
              hlevel: item.Hlevel,
              status: item.Status,
              sdata: item.Sdata
            }));

            if (itemsToInsert.length > 0) {
              await INSERT.into(FailedIdocItems).entries(itemsToInsert);
              LOG.info(`[loadFailedIdocHeaders] Saved ${itemsToInsert.length} EDIDD rows for docnum ${r.Docnum}`);
            }
          } catch (ediddErr) {
            LOG.error(`[loadFailedIdocHeaders] Failed to fetch/store EDIDD for docnum ${r.Docnum}: ${ediddErr.message}`);
          }
        }

      } catch (err) {
        /* One system failing must NOT stop processing other systems */
        LOG.error(`[loadFailedIdocHeaders] Failed for system "${sysAlias}": ${err.message}`);
      }
    }

    LOG.info(`[loadFailedIdocHeaders] Done — new records: ${totalLoaded}`);
    return { loaded: totalLoaded, status: 'SUCCESS' };
  });

  /* ═══════════════════════════════════════════════════════════════
     ACTION: getIdocData
     ───────────────────────────────────────────────────────────────
     Fetch EDIDD segment data for a specific IDoc from SAP.
  ═══════════════════════════════════════════════════════════════ */
  this.on('getIdocData', async (req) => {
    const { docnum } = req.data;
    if (!docnum) {
      return req.error(400, 'docnum is required');
    }

    try {
      LOG.info(`[getIdocData] Fetching local EDIDD for docnum: ${docnum}`);
      const rows = await SELECT.from(FailedIdocItems).where({ docnum });
      return JSON.stringify(rows);
    } catch (error) {
      LOG.error(`[getIdocData] Failed to fetch IDoc data from local DB: ${error.message}`);
      return req.error(500, `Failed to fetch IDoc data from local DB: ${error.message}`);
    }
  });

  /* ═══════════════════════════════════════════════════════════════
     FUNCTION: getSegmentsForIdoc
     ───────────────────────────────────────────────────────────────
     Returns all segment records (typed) for a specific IDoc by docnum.
  ═══════════════════════════════════════════════════════════════ */
  this.on('getSegmentsForIdoc', async (req) => {
    const { docnum } = req.data;
    if (!docnum) {
      return req.error(400, 'docnum is required');
    }

    try {
      LOG.info(`[getSegmentsForIdoc] Fetching typed segments for docnum: ${docnum}`);
      const segments = await SELECT.from(FailedIdocItems)
        .where({ docnum })
        .orderBy('segnum asc');
      return segments;
    } catch (error) {
      LOG.error(`[getSegmentsForIdoc] Failed to fetch IDoc segments: ${error.message}`);
      return req.error(500, `Failed to fetch IDoc segments: ${error.message}`);
    }
  });

});

/* ═══════════════════════════════════════════════════════════════
   LOCAL DEV MOCK DATA  (USE_MOCK_FAILED_IDOC=true)
   ─────────────────────────────────────────────────────────────── */
function getMockEdidc() {
  return [
    {
      Docnum: '000000000000000001',
      Landscape: 'S4-ONPREM-2023',
      SysAlias: 'S4HCLNT210',
      Mestyp: 'MATMAS',
      Idoctp: 'MATMAS05',
      Status: '51',
      Credat: '2026-03-20',
      Cretim: '101530',
      Sndprn: 'LSYSTEM',
      Rcvprn: 'ERPCLNT'
    },
    {
      Docnum: '000000000000000002',
      Landscape: 'S4-ONPREM-2023',
      SysAlias: 'S4HCLNT210',
      Mestyp: 'MATMAS',
      Idoctp: 'MATMAS05',
      Status: '51',
      Credat: '2026-03-21',
      Cretim: '114500',
      Sndprn: 'LSYSTEM',
      Rcvprn: 'ERPCLNT'
    },
    {
      Docnum: '000000000000000003',
      Landscape: 'ECC-617',
      SysAlias: 'EC6CLNT800',
      Mestyp: 'ORDERS',
      Idoctp: 'ORDERS05',
      Status: '51',
      Credat: '2026-03-22',
      Cretim: '092010',
      Sndprn: 'LSYSTEM',
      Rcvprn: 'ERPCLNT'
    }
  ];
}

function getMockEdidd(docnum) {
  return [
    {
      Docnum: docnum,
      Segnum: '000001',
      Segnam: 'E1MARAM',
      Psgnum: '000000',
      Hlevel: '01',
      Sdata: 'MATNR=MAT001;MBRSH=M;MTART=FERT'
    },
    {
      Docnum: docnum,
      Segnum: '000002',
      Segnam: 'E1MAKTM',
      Psgnum: '000001',
      Hlevel: '02',
      Sdata: 'SPRAS=E;MAKTX=New Material Description'
    }
  ];
}