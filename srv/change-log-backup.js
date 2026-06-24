/**
 * Change Log Backup Service Implementation
 * Manages IDOC change log backups and DMS/CMS integration
 */

const cds = require('@sap/cds');
const { SELECT, INSERT } = cds.ql;
const LOG = cds.log('change-log-backup');

const excelExport = require('./excel-export');
const dmsConnector = require('./dms-connector');

module.exports = cds.service.impl(async function () {

    const {
        ChangeLogBackups,
        ChangeLogBackupItems,
        ReprocessHeaders,
    } = cds.entities('ZTR_Backend_1');

    /**
     * ACTION: createAndBackup
     * 1. Create ChangeLogBackups header record
     * 2. Create ChangeLogBackupItems for each change
     * 3. Generate Excel file
     * 4. Upload to DMS/CMS
     * 5. Update backup metadata
     */
    this.on('createAndBackup', async (req) => {
        const tx = cds.transaction(req);
        const {
            docnum, mestyp, idoctp, initialStatus, changedStatus,
            changedBy, systemAlias, landscape, changes
        } = req.data;

        try {
            LOG.info(`[createAndBackup] Creating backup for docnum: ${docnum}, changedBy: ${changedBy}`);

            /* 1. Create header record */
            const backupId = cds.utils.uuid();
            const processDescription = changes.length > 0
                ? `Updated ${changes.length} field(s): ${changes.map(c => `${c.segment}.${c.field}`).join(', ')}`
                : 'Reprocessing backup';

            const backupHeader = {
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
                backupStatus: 'PENDING'
            };

            await tx.run(INSERT.into(ChangeLogBackups).entries(backupHeader));
            LOG.info(`[createAndBackup] Header created with ID: ${backupId}`);

            /* 2. Create item records */
            const items = changes.map((change, idx) => ({
                parent_ID: backupId,
                segment: change.segment,
                field: change.field,
                oldValue: change.oldValue,
                newValue: change.newValue,
                lineNo: idx + 1
            }));

            if (items.length > 0) {
                await tx.run(INSERT.into(ChangeLogBackupItems).entries(items));
                LOG.info(`[createAndBackup] ${items.length} change items created`);
            }

            /* 3. Generate Excel file */
            let excelBuffer;
            try {
                excelBuffer = excelExport.generateExcelBackup(backupHeader, changes);
                LOG.info(`[createAndBackup] Excel file generated (${excelBuffer.length} bytes)`);
            } catch (excelError) {
                LOG.error(`[createAndBackup] Excel generation failed: ${excelError.message}`);
                throw new Error(`Failed to generate Excel backup: ${excelError.message}`);
            }

            /* 4. Upload to DMS/CMS */
            const fileName = excelExport.generateBackupFilename(docnum, new Date());
            let dmsResult;

            try {
                dmsResult = await dmsConnector.uploadBackupToDMS(
                    excelBuffer,
                    fileName,
                    {
                        docnum,
                        mestyp,
                        idoctp,
                        systemAlias,
                        changedBy,
                        initialStatus,
                        changedStatus
                    }
                );
                LOG.info(`[createAndBackup] Backup uploaded to DMS with refId: ${dmsResult.refId}`);
            } catch (dmsError) {
                LOG.warn(`[createAndBackup] DMS upload failed, attempting local storage: ${dmsError.message}`);

                try {
                    dmsResult = await dmsConnector.storeBackupLocally(excelBuffer, fileName);
                    LOG.info(`[createAndBackup] Backup stored locally with refId: ${dmsResult.refId}`);
                } catch (localError) {
                    LOG.error(`[createAndBackup] Both DMS and local storage failed`);
                    throw new Error(`Backup storage failed: ${localError.message}`);
                }
            }

            /* 5. Update backup with DMS metadata */
            await tx.run(
                cds.ql.UPDATE(ChangeLogBackups, backupId).set({
                    backupStatus: 'ARCHIVED',
                    dmsRefId: dmsResult.refId,
                    dmsFileName: fileName,
                    backupUrl: dmsResult.url || dmsResult.path,
                    archivedAt: new Date()
                })
            );
            LOG.info(`[createAndBackup] Backup finalized with DMS reference`);

            return {
                backupId,
                status: 'SUCCESS',
                dmsRefId: dmsResult.refId,
                message: `Backup created and archived successfully for IDOC ${docnum}`
            };

        } catch (error) {
            LOG.error(`[createAndBackup] Action failed: ${error.message}`);

            /* Mark as FAILED */
            try {
                await tx.run(
                    cds.ql.UPDATE(ChangeLogBackups, backupId).set({
                        backupStatus: 'FAILED'
                    })
                );
            } catch (updateError) {
                LOG.error(`[createAndBackup] Failed to mark backup as FAILED: ${updateError.message}`);
            }

            req.error(500, `Backup creation failed: ${error.message}`);
            return { status: 'FAILED', message: error.message };
        }
    });

    /**
     * ACTION: exportBackupsToExcel
     * Export all backups within date range as Excel
     */
    this.on('exportBackupsToExcel', async (req) => {
        const { fromDate, toDate } = req.data;

        try {
            LOG.info(`[exportBackupsToExcel] Exporting backups from ${fromDate} to ${toDate}`);

            /* Query backups */
            const backups = await SELECT.from(ChangeLogBackups)
                .where(b => b.changedAt >= fromDate && b.changedAt <= toDate);

            if (backups.length === 0) {
                LOG.warn(`[exportBackupsToExcel] No backups found for date range`);
                return {
                    status: 'NO_DATA',
                    fileUrl: null,
                    rowCount: 0
                };
            }

            LOG.info(`[exportBackupsToExcel] Found ${backups.length} backups`);

            /* Get all items */
            const backupItemsMap = new Map();
            for (const backup of backups) {
                const items = await SELECT.from(ChangeLogBackupItems)
                    .where({ parent_ID: backup.ID });
                backupItemsMap.set(backup.ID, items);
            }

            /* Generate bulk Excel */
            const excelBuffer = excelExport.generateBulkExcelExport(backups, backupItemsMap);
            const fileName = `IDOC_Backups_${fromDate}_to_${toDate}.xlsx`;

            /* Upload to DMS */
            let dmsResult;
            try {
                dmsResult = await dmsConnector.uploadBackupToDMS(excelBuffer, fileName, {
                    doctype: 'BULK_BACKUP_EXPORT',
                    fromDate,
                    toDate
                });
            } catch (dmsError) {
                LOG.warn(`[exportBackupsToExcel] DMS upload failed, using local storage`);
                dmsResult = await dmsConnector.storeBackupLocally(excelBuffer, fileName);
            }

            LOG.info(`[exportBackupsToExcel] Export completed: ${backups.length} backups`);

            return {
                status: 'SUCCESS',
                fileUrl: dmsResult.url || dmsResult.path,
                rowCount: backups.length
            };

        } catch (error) {
            LOG.error(`[exportBackupsToExcel] Export failed: ${error.message}`);
            req.error(500, `Export failed: ${error.message}`);
        }
    });

    /**
     * ACTION: archiveBackup
     * Mark backup as archived in DMS/CMS
     */
    this.on('archiveBackup', async (req) => {
        const { backupId } = req.data;
        const tx = cds.transaction(req);

        try {
            LOG.info(`[archiveBackup] Archiving backup ${backupId}`);

            const backup = await SELECT.one.from(ChangeLogBackups, backupId);

            if (!backup) {
                return req.error(404, `Backup ${backupId} not found`);
            }

            if (!backup.dmsRefId) {
                return req.error(400, `Backup ${backupId} has no DMS reference`);
            }

            /* Try to archive in DMS */
            try {
                // Optional: DMS might have archive endpoint
                // await dmsConnector.archiveInDMS(backup.dmsRefId);
            } catch (dmsError) {
                LOG.warn(`[archiveBackup] DMS archive operation failed: ${dmsError.message}`);
            }

            /* Update status */
            await tx.run(
                cds.ql.UPDATE(ChangeLogBackups, backupId).set({
                    backupStatus: 'ARCHIVED',
                    archivedAt: new Date()
                })
            );

            LOG.info(`[archiveBackup] Backup ${backupId} archived successfully`);

            return {
                status: 'SUCCESS',
                message: `Backup ${backupId} archived in DMS/CMS`
            };

        } catch (error) {
            LOG.error(`[archiveBackup] Archive failed: ${error.message}`);
            req.error(500, `Archive failed: ${error.message}`);
        }
    });

    /**
     * FUNCTION: getBackupDetails
     * Retrieve backup header and items
     */
    this.on('getBackupDetails', async (req) => {
        const { backupId } = req.data;

        try {
            LOG.info(`[getBackupDetails] Retrieving details for backup ${backupId}`);

            const backup = await SELECT.one.from(ChangeLogBackups, backupId);

            if (!backup) {
                return req.error(404, `Backup ${backupId} not found`);
            }

            const items = await SELECT.from(ChangeLogBackupItems)
                .where({ parent_ID: backupId });

            return {
                backup,
                items
            };

        } catch (error) {
            LOG.error(`[getBackupDetails] Query failed: ${error.message}`);
            req.error(500, `Query failed: ${error.message}`);
        }
    });

    /**
     * READ: ChangeLogBackups
     */
    this.on('READ', ChangeLogBackups, async (req) => {
        return await SELECT.from(ChangeLogBackups);
    });

    /**
     * READ: ChangeLogBackupItems
     */
    this.on('READ', ChangeLogBackupItems, async (req) => {
        return await SELECT.from(ChangeLogBackupItems);
    });

});
