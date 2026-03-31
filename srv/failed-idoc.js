const cds = require('@sap/cds');

/**
 * Toggle:
 *  - true  → mock EDIDC data (local dev)
 *  - false → real SAP OData via destination (CF)
 */
const USE_MOCK_FAILED_IDOC =
  process.env.USE_MOCK_FAILED_IDOC === 'true';

module.exports = cds.service.impl(async function () {

  const {
    FailedIdocHeaders,
    MessageTypesForMetadata,
    ErrorCodes
  } = cds.entities('ZTR_Backend_1');

  // Only connect when needed
  let edidcSrv = null;
  if (!USE_MOCK_FAILED_IDOC) {
    edidcSrv = await cds.connect.to('Corrected_Error_EDIDC');
  }

  this.on('loadFailedIdocHeaders', async (req) => {
    const tx = cds.tx(req);

    /* ---------------------------------------------
       1. Read active configuration
    --------------------------------------------- */
    const msgCfg = await tx.run(
      SELECT.from(MessageTypesForMetadata).where({ active: true })
    );

    const errCfg = await tx.run(
      SELECT.from(ErrorCodes).where({ active: true })
    );

    if (!msgCfg.length || !errCfg.length) {
      return { loaded: 0, status: 'NO_CONFIG' };
    }

    /* ---------------------------------------------
       2. Fetch EDIDC data
    --------------------------------------------- */
    let rows = [];

    if (USE_MOCK_FAILED_IDOC) {
      rows = getMockEdidc();
    } else {
      const msgTypes = [...new Set(msgCfg.map(m => `'${m.messageType}'`))].join(',');
      const errCodes = [...new Set(errCfg.map(e => `'${e.errorCode}'`))].join(',');

      const sapQuery = SELECT.from(edidcSrv.entities.EDIDCSet)
        .where(`
          Mestyp in (${msgTypes})
          and Status in (${errCodes})
        `);

      rows = await edidcSrv.run(sapQuery);
    }

    /* ---------------------------------------------
       3. Filter inside CAP by SysAlias + Landscape
    --------------------------------------------- */
    const validKeys = new Set(
      msgCfg.map(
        m => `${m.messageType}|${m.systemAlias}|${m.sapLandscape}`
      )
    );

    const filteredRows = rows.filter(r =>
      validKeys.has(`${r.Mestyp}|${r.SysAlias}|${r.Landscape}`)
    );

    /* ---------------------------------------------
       4. Persist snapshot
    --------------------------------------------- */
    let count = 0;

    for (const r of filteredRows) {
      await tx.run(
        INSERT.into(FailedIdocHeaders).entries({
          docnum: r.Docnum,
          mestyp: r.Mestyp,
          idoctp: r.Idoctp,
          status: r.Status,
          landscape: r.Landscape,
          systemAlias: r.SysAlias,
          createdOn: r.Credat,
          createdTime: r.Cretim,
          sender: r.Sndprn,
          receiver: r.Rcvprn,
          errorFlag: true
        })
      );
      count++;
    }

    return { loaded: count, status: 'SUCCESS' };
  });
});

/* ---------------------------------------------
   Inline mock EDIDC data (local dev only)
--------------------------------------------- */
function getMockEdidc() {
  return [
    {
      Docnum: '000000000000000001',
      Landscape: 'S4-ONPREM-2023',
      SysAlias: 'S4HCLNT210',
      Mestyp: 'MATMAS',
      Idoctp: 'MATMAS05',
      Status: '51',
      Credat: new Date('2026-03-20T00:00:00Z'),
      Cretim: '10:15:30',
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
      Credat: new Date('2026-03-21T00:00:00Z'),
      Cretim: '11:45:00',
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
      Credat: new Date('2026-03-22T00:00:00Z'),
      Cretim: '09:20:10',
      Sndprn: 'LSYSTEM',
      Rcvprn: 'ERPCLNT'
    }
  ];
}