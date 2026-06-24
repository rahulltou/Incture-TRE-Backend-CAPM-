const cds = require('@sap/cds');
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');
const axios = require('axios');
const { SELECT, UPDATE, INSERT } = cds.ql;
const LOG = cds.log('reprocess');

module.exports = cds.service.impl(function () {

    const {
        ReprocessHeaders,
        ReprocessItems,
        FailedIdocHeaders,
        ErrorCodes,
        ChangeLogBackups,
        ChangeLogBackupItems
    } = cds.entities('ZTR_Backend_1');

    /**
     * Internal backup creation helper
     * Automatically creates backup when reprocess is submitted
     */
    async function createInternalBackup(docnum, mestyp, idoctp, initialStatus, changedStatus, changedBy, systemAlias, landscape, changes) {
        try {
            LOG.info(`[createInternalBackup] Creating backup for docnum ${docnum} with ${changes.length} changes`);

            const backupId = cds.utils.uuid();
            const processDescription = changes.length > 0
                ? `Reprocessed ${changes.length} field(s): ${changes.map(c => `${c.segment}.${c.field}`).join(', ')}`
                : 'Reprocessing backup';

            const tx = cds.transaction();

            // Insert backup header
            await tx.run(
                INSERT.into(ChangeLogBackups).entries({
                    ID: backupId,
                    docnum,
                    mestyp,
                    idoctp,
                    initialStatus,
                    changedStatus,
                    changedBy,
                    changedAt: new Date(),
                    systemAlias,
                    landscape,
                    processDescription,
                    backupStatus: 'ARCHIVED',
                    archivedAt: new Date()
                })
            );

            // Insert backup items
            for (let idx = 0; idx < changes.length; idx++) {
                const change = changes[idx];
                await tx.run(
                    INSERT.into(ChangeLogBackupItems).entries({
                        parent_ID: backupId,
                        segment: change.segment,
                        field: change.field,
                        oldValue: change.oldValue,
                        newValue: change.newValue,
                        lineNo: idx + 1
                    })
                );
            }

            await tx.commit();
            LOG.info(`[createInternalBackup] Backup created successfully with ID: ${backupId}`);
            return { success: true, backupId };

        } catch (backupError) {
            LOG.warn(`[createInternalBackup] Backup creation failed (non-critical): ${backupError.message}`);
            return { success: false, error: backupError.message };
        }
    }

    /**
     * Submit reprocessing attempt
     * - Persist audit data
     * - Call CPI with IDOC + changes
     */
    // this.on('submitReprocessAttempt', async (req) => {
    //     const { payload, changedBy, systemAlias, changes } = req.data;
    //     const tx = cds.transaction(req);

    //     const { CONTROL } = payload;
    //     const docnum = CONTROL.DOCNUM;

    //     LOG.info(`[submitReprocessAttempt] Received reprocessing request for docnum ${docnum} from ${changedBy} on ${systemAlias}`);

    //     // Manually generate the UUID for the Header
    //     const attemptId = cds.utils.uuid();

    //     /* 1. Persist attempt header */
    //     await tx.run(
    //         INSERT.into(ReprocessHeaders).entries({
    //             ID: attemptId,
    //             docnum,
    //             changedBy,
    //             changedAt: new Date(),
    //             currentStatus: CONTROL.STATUS,
    //             reprocessStatus: 'SUBMITTED',
    //             reprocessMessage: null
    //         })
    //     );
    //     /* 2. Persist corrected fields */
    //     for (const c of changes) {
    //         await tx.run(
    //             INSERT.into(ReprocessItems).entries({
    //                 parent_ID: attemptId,
    //                 segment: c.segment,
    //                 field: c.field,
    //                 oldValue: c.oldValue,
    //                 newValue: c.newValue
    //             })
    //         );
    //     }

    //     const destination = systemAlias;
    //     /* 3. Call CPI (EDIDC + EDIDD + changes) */
    //     const cpiPayload = {
    //         // attemptId: header.ID,
    //         attemptId: attemptId,
    //         destination: destination,
    //         idoc: payload
    //         // changes
    //     };

    // /* Mock Payload for CPI to Re-Process */
    //     //         {
    //     //   "attemptId": "9b99ab1f-35fc-4e88-bd5b-4d05f7c2d001",

    //     //   "payload": {
    //     //     "CONTROL": {
    //     //       "DOCNUM": "000000000000000001",
    //     //       "MESTYP": "MATMAS",
    //     //       "IDOCTYP": "MATMAS05",
    //     //       "DIRECT": "2",
    //     //       "RCVPRN": "ERPCLNT",
    //     //       "SNDPRN": "LSYSTEM",
    //     //       "STATUS": "51"
    //     //     },
    //     //     "DATA": [
    //     //       {
    //     //         "SEGNAM": "E1MARAM",
    //     //         "HLEVEL": 1,
    //     //         "SDATA": "MATNR=MAT001;MBRSH=M;MTART=FERT"
    //     //       },
    //     //       {
    //     //         "SEGNAM": "E1MAKTM",
    //     //         "HLEVEL": 2,
    //     //         "SDATA": "SPRAS=E;MAKTX=New Material Description"
    //     //       }
    //     //     ]
    //     //   }
    //     // }

    //     try {
    //         LOG.info(`[submitReprocessAttempt] Forwarding to CPI (${destination}) for attempt ${attemptId}...`);
    //         await executeHttpRequest(
    //             // { destinationName: 'CPI_REPROCESS_IDOC' },
    //             { destinationName: 'CPI_IFLOW_DEST' }, // Use a logical name
    //             {
    //                 method: 'POST',
    //                 // url: '/http/ZTRE/IDOC/Reprocess', // Relative path from CPI iFlow
    //                 url: '/http/IdocReprocessing',
    //                 data: cpiPayload,
    //                 headers: { 'Content-Type': 'application/json' }
    //             }
    //         );
    //         LOG.info(`[submitReprocessAttempt] Successfully forwarded to CPI.`);
    //         // return { status: 'SUCCESS', message: 'Forwarded to CPI' };
    //     } catch (error) {
    //         LOG.error(`[submitReprocessAttempt] CPI Communication Failed for attempt ${attemptId}: ${error.message}`);
    //         req.error(500, `CPI Communication Failed: ${error.message}`);
    //     }

    //     return {
    //         attemptId: attemptId,
    //         status: 'SUBMITTED'
    //     };
    // });

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

    this.on('submitReprocessAttempt', async (req) => {

        const { payload, changedBy, systemAlias, changes } = req.data;

        const { CONTROL } = payload;
        const docnum = CONTROL.DOCNUM;

        LOG.info(
            `[submitReprocessAttempt] Received reprocessing request for docnum ${docnum} from ${changedBy} on ${systemAlias}`
        );

        // Generate UUID
        const attemptId = cds.utils.uuid();

        // CPI Payload
        const cpiPayload = {
            attemptId,
            destination: systemAlias,
            payload: payload
        };

        LOG.info(
            `[submitReprocessAttempt] Generated attempt ID ${attemptId} and prepared CPI payload for docnum ${docnum}: ${JSON.stringify(cpiPayload)}`
        );

        /*
         * STEP 1
         * Save data in DB FIRST
         * Independent transaction
         */
        const tx = cds.transaction();

        const failedHeader = await tx.run(SELECT.one.from(FailedIdocHeaders).where({ docnum }));

        try {

            // Insert Header
            await tx.run(
                INSERT.into(ReprocessHeaders).entries({
                    ID: attemptId,
                    docnum,
                    changedBy,
                    changedAt: new Date(),
                    currentStatus: failedHeader.status,
                    toBeStatus: CONTROL.STATUS,
                    reprocessStatus: 'SUBMITTED',
                    reprocessMessage: null
                })
            );

            // Insert Items
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

            // IMPORTANT
            // Commit DB transaction BEFORE CPI call
            await tx.commit();

            LOG.info(
                `[submitReprocessAttempt] DB records saved successfully for attempt ${attemptId}`
            );

            /*
             * STEP 1.5
             * Create internal backup asynchronously (fire and forget)
             * Non-blocking: doesn't delay API response
             */
            cds.spawn(async () => {
                try {
                    const backupResult = await createInternalBackup(
                        docnum,
                        CONTROL.MESTYP,
                        CONTROL.IDOCTYP,
                        failedHeader.status,
                        CONTROL.STATUS,
                        changedBy,
                        systemAlias,
                        failedHeader.landscape,
                        changes
                    );
                    if (backupResult.success) {
                        LOG.info(`[submitReprocessAttempt] Internal backup created: ${backupResult.backupId}`);
                    }
                } catch (backupSpawnError) {
                    LOG.error(`[submitReprocessAttempt] Backup spawn failed: ${backupSpawnError.message}`);
                }
            });

        } catch (dbError) {

            await tx.rollback(dbError);

            LOG.error(
                `[submitReprocessAttempt] DB Save Failed for attempt ${attemptId}: ${dbError.message}`
            );

            return req.error(
                500,
                `DB Save Failed: ${dbError.message}`
            );
        }

        /*
         * STEP 2
         * Call CPI separately
         * Even if CPI fails DB remains saved
         */
        try {

            LOG.info(
                `[submitReprocessAttempt] Forwarding to CPI (${systemAlias}) for attempt ${attemptId}...`
            );

            const data = await executeHttpRequest(
                {
                    destinationName: 'CPI_IFLOW_DEST'
                },
                {
                    method: 'POST',
                    url: '/http/transactionReprocessing',
                    data: cpiPayload,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            LOG.info(
                `[submitReprocessAttempt] CPI response for attempt ${attemptId}: ${data.status} ${data.statusText} JSONDATA: ${JSON.stringify(data.data)}`
            );

            LOG.info(
                `[submitReprocessAttempt] Using axios to call CPI endpoint for attempt ${attemptId}...`
            );

            // // Use axios to POST to the CPI endpoint with provided credentials
            // const cpiUser = 'sb-ed386d9e-a332-4d22-b26e-6ac05814ea1d!b63626|it-rt-inccpidev!b16077';
            // const cpiPwd = 'f9677ae8-b1e2-4e09-bb2e-0f22d14236ee$FDsyqDwD8BHfW5r2yZX-SU4_ijoeOxwTSVn7eq4YCB4=';
            // const cpiEndpoint = 'https://inccpidev.it-cpi001-rt.cfapps.eu10.hana.ondemand.com/http/transactionReprocessing';

            // const response = await axios.post(cpiEndpoint, cpiPayload, {
            //     headers: {
            //         'Content-Type': 'application/json',
            //         'Authorization': `Basic ${Buffer.from(`${cpiUser}:${cpiPwd}`).toString('base64')}`
            //     },
            //     timeout: 60000
            // });

            // LOG.info(
            //     `[submitReprocessAttempt] CPI response for attempt ${attemptId}: ${response.status} ${response.statusText} JSON. Data: ${JSON.stringify(response.data)}`
            // );


            LOG.info(
                `[submitReprocessAttempt] Successfully forwarded to CPI for attempt ${attemptId}`
            );

            // Update status SUCCESS with new transaction
            const txSuccess = cds.transaction();
            await txSuccess.run(
                UPDATE(ReprocessHeaders)
                    .set({
                        reprocessStatus: 'SUCCESS',
                        reprocessMessage: 'Successfully forwarded to CPI'
                    })
                    .where({
                        ID: attemptId
                    })
            );
            await txSuccess.commit();

        } catch (cpiError) {

            LOG.error(
                `[submitReprocessAttempt] CPI Communication Failed for attempt ${attemptId}: ${cpiError.message}`
            );

            // Update status FAILED with new transaction
            const txFailed = cds.transaction();

            const failureMessage = `CPI call failed: ${cpiError.message}`;

            await txFailed.run(
                UPDATE(ReprocessHeaders)
                    .set({
                        reprocessStatus: 'CPI-FAILED',
                        reprocessMessage: failureMessage
                    })
                    .where({
                        ID: attemptId
                    })
            );
            await txFailed.commit();

            LOG.info(`[submitReprocessAttempt] Updated attempt ${attemptId} with CPI-FAILED status and message: ${failureMessage}`);

            // OPTIONAL:
            // Don't throw req.error here
            // Otherwise user gets 500 and may retry unnecessarily
        }

        return {
            attemptId,
            status: 'SUBMITTED'
        };

    });


    this.on("getProcessInfoForIdoc", async (req) => {
        const { docnum } = req.data;

        const header = await SELECT.one
            .from(ReprocessHeaders)
            .columns(
                '*',
                {
                    ref: ['items'],
                    expand: ['*']
                }
            )
            .where({ docnum })
            .orderBy('createdAt desc');

        if (!header) {
            return [];
        }

        return (header.items || []).map(item => ({
            segment: item.segment,
            field: item.field,
            oldValue: item.oldValue,
            newValue: item.newValue,
            modifiedDate: header.changedAt,
            modifiedBy: header.changedBy
        }));
    });
    /**
     * CPI callback updates attempt result
     * - Map SAP status → business status
     */

    this.on('updateReprocessResult', async (req) => {
        const { attemptId, idocStatus, reprocessMessage } = req.data;
        const tx = cds.tx(req);

        try {
            LOG.info(
                `[updateReprocessResult] Received callback for attempt ${attemptId} with status ${idocStatus}, message: ${reprocessMessage}`
            );

            const reprocessHeader = await tx.run(
                SELECT.one.from(ReprocessHeaders).where({ ID: attemptId })
            );

            if (!reprocessHeader) {
                LOG.warn(`[updateReprocessResult] Attempt ${attemptId} not found`);
                return req.error(404, 'Reprocess attempt not found');
            }

            let reprocessStatus = 'CPI-FAILED';

            if (reprocessHeader.toBeStatus === idocStatus) {
                reprocessStatus = 'RE-PROCESSED';

                LOG.info(
                    `[updateReprocessResult] IDOC reached desired status ${idocStatus}. Marking as ${reprocessStatus}.`
                );

                await tx.run(
                    UPDATE(ReprocessHeaders)
                        .set({
                            currentStatus: idocStatus,
                            reprocessStatus,
                            reprocessMessage: 'IDOC reached desired status'
                        })
                        .where({ ID: attemptId })
                );

                await tx.run(
                    UPDATE(FailedIdocHeaders)
                        .set({
                            status: idocStatus,
                            processingStatus: 'RE-PROCESSED',
                            errorFlag: false
                        })
                        .where({ docnum: reprocessHeader.docnum })
                );

                // Get failed IDOC record for backup
                const failedIdocRecord = await tx.run(
                    SELECT.one.from(FailedIdocHeaders)
                        .where({ docnum: reprocessHeader.docnum })
                );

                // Get all reprocess items for backup
                const reprocessItems = await tx.run(
                    SELECT.from(ReprocessItems)
                        .where({ parent_ID: attemptId })
                );

                // Create completion backup asynchronously (non-blocking)
                cds.spawn(async () => {
                    try {
                        const completionBackup = await createInternalBackup(
                            reprocessHeader.docnum,
                            failedIdocRecord?.mestyp || 'UNKNOWN',
                            failedIdocRecord?.idoctp || 'UNKNOWN',
                            reprocessHeader.currentStatus,
                            idocStatus,
                            reprocessHeader.changedBy,
                            failedIdocRecord?.systemAlias || 'UNKNOWN',
                            failedIdocRecord?.landscape || 'UNKNOWN',
                            reprocessItems.map(item => ({
                                segment: item.segment,
                                field: item.field,
                                oldValue: item.oldValue,
                                newValue: item.newValue
                            }))
                        );
                        if (completionBackup.success) {
                            LOG.info(`[updateReprocessResult] Completion backup created: ${completionBackup.backupId}`);
                        }
                    } catch (completionBackupError) {
                        LOG.error(`[updateReprocessResult] Completion backup failed: ${completionBackupError.message}`);
                    }
                });
            } else {
                LOG.info(
                    `[updateReprocessResult] IDOC status ${idocStatus} does not match expected status ${reprocessHeader.toBeStatus}.`
                );

                const cpiMsg = `IDOC status ${idocStatus} does not match expected status ${reprocessHeader.toBeStatus}`;

                await tx.run(
                    UPDATE(ReprocessHeaders)
                        .set({
                            reprocessStatus,
                            reprocessMessage: cpiMsg
                        })
                        .where({ ID: attemptId })
                );

                LOG.info(`[updateReprocessResult] Set reprocessMessage to: ${cpiMsg}`);
            }

            // Commit the transaction to persist changes
            await tx.commit();

            LOG.info(`[updateReprocessResult] Transaction committed for attempt ${attemptId}`);

            LOG.info(
                `[updateReprocessResult] Updated attempt ${attemptId} with business status ${reprocessStatus}`
            );

            return {
                status: reprocessStatus
            };
        } catch (error) {
            LOG.error(
                `[updateReprocessResult] Error processing attempt ${attemptId}: ${error.message}`
            );
            await tx.rollback(error);
            return req.error(500, error.message);
        }
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

        LOG.info(`[archiveReprocessed] Checking for successful IDocs to archive...`);

        /* 1. Find successful reprocess attempts */
        const successfulAttempts = await tx.run(
            SELECT.from(ReprocessHeaders)
                .where({ reprocessStatus: 'RE-PROCESSED' })
                .columns(['ID', 'docnum'])
        );

        if (!successfulAttempts.length) {
            LOG.info(`[archiveReprocessed] No successful attempts found to archive.`);
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

        LOG.info(`[archiveReprocessed] Successfully archived ${successfulAttempts.length} IDoc(s).`);

        return {
            archivedCount: successfulAttempts.length,
            status: 'ARCHIVED_RE-PROCESSED_IDOCS'
        };
    });

});