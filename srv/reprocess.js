const cds = require('@sap/cds');
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');

module.exports = cds.service.impl(function () {

    const {
        ReprocessHeaders,
        ReprocessItems,
        FailedIdocHeaders,
        ErrorCodes
    } = cds.entities('ZTR_Backend_1');

    /**
     * Submit reprocessing attempt
     * - Persist audit data
     * - Call CPI with IDOC + changes
     */
    this.on('submitReprocessAttempt', async (req) => {
        const { payload, changedBy, systemAlias, changes } = req.data;
        const tx = cds.tx(req);

        const { CONTROL } = payload;
        const docnum = CONTROL.DOCNUM;

        // Manually generate the UUID for the Header
        const attemptId = cds.utils.uuid();

        /* 1. Persist attempt header */
        await tx.run(
            INSERT.into(ReprocessHeaders).entries({
                ID: attemptId,
                docnum,
                changedBy,
                changedAt: new Date(),
                currentStatus: CONTROL.STATUS,
                reprocessStatus: 'SUBMITTED',
                reprocessMessage: null
            })
        );

        /* 2. Persist corrected fields */
        for (const c of changes) {
            await tx.run(
                INSERT.into(ReprocessItems).entries({
                    parent_ID: attemptId,
                    segment: c.segment,
                    field: c.field,
                    oldValue: c.oldValue,
                    newValue: c.newValue
                })
            );
        }

        const destination = systemAlias;
        /* 3. Call CPI (EDIDC + EDIDD + changes) */
        const cpiPayload = {
            // attemptId: header.ID,
            attemptId: attemptId,
            destination: destination,
            idoc: payload
            // changes
        };

    /* Mock Payload for CPI to Re-Process */
        //         {
        //   "attemptId": "9b99ab1f-35fc-4e88-bd5b-4d05f7c2d001",

        //   "payload": {
        //     "CONTROL": {
        //       "DOCNUM": "000000000000000001",
        //       "MESTYP": "MATMAS",
        //       "IDOCTYP": "MATMAS05",
        //       "DIRECT": "2",
        //       "RCVPRN": "ERPCLNT",
        //       "SNDPRN": "LSYSTEM",
        //       "STATUS": "51"
        //     },
        //     "DATA": [
        //       {
        //         "SEGNAM": "E1MARAM",
        //         "HLEVEL": 1,
        //         "SDATA": "MATNR=MAT001;MBRSH=M;MTART=FERT"
        //       },
        //       {
        //         "SEGNAM": "E1MAKTM",
        //         "HLEVEL": 2,
        //         "SDATA": "SPRAS=E;MAKTX=New Material Description"
        //       }
        //     ]
        //   }
        // }

        try {
            await executeHttpRequest(
                // { destinationName: 'CPI_REPROCESS_IDOC' },
                { destinationName: 'CPI_IFLOW_DEST' }, // Use a logical name
                {
                    method: 'POST',
                    // url: '/http/ZTRE/IDOC/Reprocess', // Relative path from CPI iFlow
                    url: '/http/IdocReprocessing',
                    data: cpiPayload,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
            // return { status: 'SUCCESS', message: 'Forwarded to CPI' };
        } catch (error) {
            req.error(500, `CPI Communication Failed: ${err.message}`);
        }

        return {
            attemptId: header.ID,
            status: 'SUBMITTED'
        };
    });

    // For Mocking Only- need to Remove
    // this.on('submitReprocessAttempt', async (req) => {
    //     const tx = cds.tx(req);

    //     /**
    //      * Inline mock data for local testing
    //      * Aligned with FailedIdocHeaders mock
    //      */
    //     const mockDocnum = '000000000000000001'; // MATMAS
    //     const mockChangedBy = 'LOCAL_TEST_USER';

    //     const mockChanges = [
    //         {
    //             segment: 'E1MARAM',
    //             field: 'MTART',
    //             oldValue: 'ROH',
    //             newValue: 'FERT'
    //         },
    //         {
    //             segment: 'E1MAKTM',
    //             field: 'MAKTX',
    //             oldValue: 'Old Material Desc',
    //             newValue: 'New Material Description'
    //         }
    //     ];

    //     // 1. Create Reprocess Header
    //     // const header = await tx.run(
    //     //     INSERT.into(ReprocessHeaders).entries({
    //     //         docnum: mockDocnum,
    //     //         changedBy: mockChangedBy,
    //     //         changedAt: new Date(),
    //     //         currentStatus: '51',          // failed IDOC status
    //     //         reprocessStatus: 'SUBMITTED', // initial status
    //     //         reprocessMessage: null
    //     //     })
    //     // );

    //     // Manually generate the UUID for the Header
    //     const attemptId = cds.utils.uuid();


    //     // Insert Header
    //     await tx.run(
    //         INSERT.into(ReprocessHeaders).entries({
    //             ID: attemptId,                 // Explicit ID
    //             docnum: mockDocnum,
    //             changedBy: mockChangedBy,
    //             changedAt: new Date(),
    //             currentStatus: '51',
    //             reprocessStatus: 'SUBMITTED',
    //             reprocessMessage: null
    //         })
    //     );

    //     // 2. Insert Reprocess Items
    //     for (const c of mockChanges) {
    //         await tx.run(
    //             INSERT.into(ReprocessItems).entries({
    //                 // parent_ID: header.ID,
    //                 parent_ID: attemptId,
    //                 segment: c.segment,
    //                 field: c.field,
    //                 oldValue: c.oldValue,
    //                 newValue: c.newValue
    //             })
    //         );
    //     }

    //     return {
    //         // attemptId: header.ID,
    //         attemptId: attemptId,
    //         status: 'SUBMITTED'
    //     };
    // });

    /**
     * CPI callback updates attempt result
     * - Map SAP status → business status
     */

    this.on('updateReprocessResult', async (req) => {
        const { attemptId, idocStatus, reprocessMessage } = req.data;
        const tx = cds.tx(req);

        const attempt = await tx.run(
            SELECT.one.from(ReprocessHeaders).where({ ID: attemptId })
        );

        if (!attempt) {
            return req.error(404, 'Reprocess attempt not found');
        }

        /* Check if status is configured as error */
        const errorCode = await tx.run(
            SELECT.one.from(ErrorCodes)
                .where({ errorCode: idocStatus, active: true })
        );

        const reprocessStatus = errorCode ? 'FAILED' : 'RE-PROCESSED';
        const currentStatus = idocStatus;

        /* Update attempt */
        await tx.run(
            UPDATE(ReprocessHeaders)
                .set({
                    currentStatus,
                    reprocessStatus,
                    reprocessMessage
                })
                .where({ ID: attemptId })
        );

        /* Sync FailedIdocHeaders on success */
        if (reprocessStatus === 'RE-PROCESSED') {
            await tx.run(
                UPDATE(FailedIdocHeaders)
                    .set({
                        status: idocStatus, //'PROCESSED',
                        errorFlag: false
                    })
                    .where({ docnum: attempt.docnum })
            );
        }

        return { status: reprocessStatus };
    });


    // // For Mocking Only- need to Remove
    // this.on('updateReprocessResult', async (req) => {
    //     const tx = cds.tx(req);

    //     /**
    //      * Mock CPI callback payload for local testing
    //      * (If payload provided, use it; otherwise mock)
    //      */
    //     const attemptId =
    //         req.data.attemptId || '9b99ab1f-35fc-4e88-bd5b-4d05f7c2d001'; // fallback only for dev

    //     const idocStatus = req.data.idocStatus || '53'; // 53 = SUCCESS
    //     const reprocessMessage =
    //         req.data.reprocessMessage || 'IDOC Reprocessed Successfully (Mock)';

    //     /* 1. Load reprocess attempt */
    //     const attempt = await tx.run(
    //         SELECT.one.from(ReprocessHeaders).where({ ID: attemptId })
    //     );

    //     if (!attempt) {
    //         return req.error(404, 'Reprocess attempt not found');
    //     }

    //     /* 2. Determine business reprocess status */
    //     const errorCode = await tx.run(
    //         SELECT.one.from(ErrorCodes)
    //             .where({ errorCode: idocStatus, active: true })
    //     );

    //     const reprocessStatus = errorCode ? 'FAILED' : 'SUCCESS';
    // const currentStatus = idocStatus;

    //     /* Update attempt */
    //     await tx.run(
    //         UPDATE(ReprocessHeaders)
    //             .set({
    //                 currentStatus,
    //                 reprocessStatus,
    //                 reprocessMessage
    //             })
    //             .where({ ID: attemptId })
    //     );

    //     /* Sync FailedIdocHeaders on success */
    //     if (reprocessStatus === 'SUCCESS') {
    //         await tx.run(
    //             UPDATE(FailedIdocHeaders)
    //                 .set({
    //                     status: idocStatus, //'PROCESSED',
    //                     errorFlag: false
    //                 })
    //                 .where({ docnum: attempt.docnum })
    //         );
    //     }

    //     return { status: reprocessStatus };
    // });


    /**
     * Archive all data for an IDOC
     */

    // this.on('archiveReprocessed', async (req) => {
    //     const { docnum } = req.data;
    //     const tx = cds.tx(req);

    //     await tx.run(
    //         DELETE.from(ReprocessItems)
    //             .where({
    //                 parent_ID: {
    //                     in: SELECT('ID')
    //                         .from(ReprocessHeaders)
    //                         .where({ docnum })
    //                 }
    //             })
    //     );

    //     await tx.run(
    //         DELETE.from(ReprocessHeaders)
    //             .where({ docnum })
    //     );

    //     await tx.run(
    //         DELETE.from(FailedIdocHeaders)
    //             .where({ docnum })
    //     );

    //     return { status: 'ARCHIVED' };
    // });

    this.on('archiveReprocessed', async (req) => {
        const tx = cds.tx(req);

        /* 1. Find successful reprocess attempts */
        const successfulAttempts = await tx.run(
            SELECT.from(ReprocessHeaders)
                .where({ reprocessStatus: 'RE-PROCESSED' })
                .columns(['ID', 'docnum'])
        );

        if (!successfulAttempts.length) {
            return {
                archivedCount: 0,
                status: 'NO_SUCCESSFUL_ATTEMPTS'
            };
        }

        const attemptIds = successfulAttempts.map(a => a.ID);
        const docnums = successfulAttempts.map(a => a.docnum);

        /* 2. Delete ReprocessItems */
        await tx.run(
            DELETE.from(ReprocessItems)
                .where({ parent_ID: { in: attemptIds } })
        );

        /* 3. Delete ReprocessHeaders */
        await tx.run(
            DELETE.from(ReprocessHeaders)
                .where({ ID: { in: attemptIds } })
        );

        /* 4. Delete FailedIdocHeaders */
        await tx.run(
            DELETE.from(FailedIdocHeaders)
                .where({ docnum: { in: docnums } })
        );

        return {
            archivedCount: successfulAttempts.length,
            status: 'ARCHIVED_RE-PROCESSED_IDOCS'
        };
    });

});