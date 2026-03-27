const cds = require('@sap/cds');

module.exports = cds.service.impl(async function () {

  const {
    FailedIdocHeaders,
    MessageTypesForMetadata,
    ErrorCodes
  } = cds.entities('ZTR_Backend_1');

  const edidcSrv = await cds.connect.to('Corrected_Error_EDIDC');

  this.on('loadFailedIdocHeaders', async (req) => {
    const tx = cds.tx(req);

    /* --------------------------------------------------
       1. Read active configuration
    -------------------------------------------------- */
    const msgCfg = await tx.run(
      SELECT.from(MessageTypesForMetadata).where({ active: true })
    );

    const errCfg = await tx.run(
      SELECT.from(ErrorCodes).where({ active: true })
    );

    if (!msgCfg.length || !errCfg.length) {
      return { loaded: 0, status: 'NO_CONFIG' };
    }

    /* --------------------------------------------------
       2. Push ONLY message type & status to SAP
    -------------------------------------------------- */
    const msgTypes = [...new Set(msgCfg.map(m => `'${m.messageType}'`))].join(',');
    const errCodes = [...new Set(errCfg.map(e => `'${e.errorCode}'`))].join(',');

    const sapQuery = SELECT.from(edidcSrv.entities.EDIDC)
      .where(`
        Mestyp in (${msgTypes})
        and Status in (${errCodes})
      `);

    /* --------------------------------------------------
       3. Call SAP OData
    -------------------------------------------------- */
    const sapRows = await edidcSrv.run(sapQuery);

    /* --------------------------------------------------
       4. Filter INSIDE CAP by SysAlias & Landscape
    -------------------------------------------------- */
    const validKeys = new Set(
      msgCfg.map(
        m => `${m.messageType}|${m.systemAlias}|${m.sapLandscape}`
      )
    );

    const filteredRows = sapRows.filter(r =>
      validKeys.has(
        `${r.Mestyp}|${r.SysAlias}|${r.Landscape}`
      )
    );

    /* --------------------------------------------------
       5. Persist snapshot
    -------------------------------------------------- */
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