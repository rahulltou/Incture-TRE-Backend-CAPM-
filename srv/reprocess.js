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
        const { payload, changedBy, changes } = req.data;
        const tx = cds.tx(req);

        const { CONTROL } = payload;
        const docnum = CONTROL.DOCNUM;

        /* 1. Persist attempt header */
        const header = await tx.run(
            INSERT.into(ReprocessHeaders).entries({
                docnum,
                changedBy,
                changedAt: new Date(),
                currentStatus: CONTROL.STATUS,
                reprocessStatus: 'SUBMITTED'
            })
        );

        /* 2. Persist corrected fields */
        for (const c of changes) {
            await tx.run(
                INSERT.into(ReprocessItems).entries({
                    parent_ID: header.ID,
                    segment: c.segment,
                    field: c.field,
                    oldValue: c.oldValue,
                    newValue: c.newValue
                })
            );
        }

        /* 3. Call CPI (EDIDC + EDIDD + changes) */
        const cpiPayload = {
            attemptId: header.ID,
            idoc: payload
            // changes
        };

        await executeHttpRequest(
            { destinationName: 'CPI_REPROCESS_IDOC' },
            {
                method: 'POST',
                data: cpiPayload,
                headers: { 'Content-Type': 'application/json' }
            }
        );

        return {
            attemptId: header.ID,
            status: 'SUBMITTED'
        };
    });

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

        const reprocessStatus = errorCode ? 'FAILED' : 'SUCCESS';

        /* Update attempt */
        await tx.run(
            UPDATE(ReprocessHeaders)
                .set({
                    reprocessStatus,
                    reprocessMessage
                })
                .where({ ID: attemptId })
        );

        /* Sync FailedIdocHeaders on success */
        if (reprocessStatus === 'SUCCESS') {
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

    /**
     * Archive all data for an IDOC
     */
    this.on('archiveReprocessed', async (req) => {
        const { docnum } = req.data;
        const tx = cds.tx(req);

        await tx.run(
            DELETE.from(ReprocessItems)
                .where({
                    parent_ID: {
                        in: SELECT('ID')
                            .from(ReprocessHeaders)
                            .where({ docnum })
                    }
                })
        );

        await tx.run(
            DELETE.from(ReprocessHeaders)
                .where({ docnum })
        );

        await tx.run(
            DELETE.from(FailedIdocHeaders)
                .where({ docnum })
        );

        return { status: 'ARCHIVED' };
    });
});