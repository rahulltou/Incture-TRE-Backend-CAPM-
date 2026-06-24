/**
 * Excel Export Utility
 * Generates Excel files for backup exports
 * Requires: npm install xlsx
 */

const XLSX = require('xlsx');
const moment = require('moment');

/**
 * Generate Excel workbook from backups
 * @param {Array} backup - ChangeLogBackups record
 * @param {Array} backupItems - Array of ChangeLogBackupItems records
 * @returns {Buffer} Excel file buffer
 */
function generateExcelBackup(backup, backupItems) {
    try {
        const workbook = XLSX.utils.book_new();

        /* Sheet 1: Summary */
        const summaryData = [
            {
                'IDOC Number': backup.docnum,
                'Message Type': backup.mestyp,
                'IDOC Type': backup.idoctp,
                'Initial Status': backup.initialStatus,
                'Changed Status': backup.changedStatus,
                'System': backup.systemAlias,
                'Landscape': backup.landscape,
                'Changed By': backup.changedBy,
                'Changed At': backup.changedAt ? new Date(backup.changedAt).toISOString() : '',
                'Description': backup.processDescription || '',
                'Backup Status': backup.backupStatus,
            }
        ];

        const summarySheet = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

        /* Sheet 2: Change Details */
        const changeDetails = (backupItems || []).map((item, idx) => ({
            'Line No': idx + 1,
            'Segment': item.segment,
            'Field': item.field,
            'Old Value': item.oldValue,
            'New Value': item.newValue,
        }));

        if (changeDetails.length > 0) {
            const detailsSheet = XLSX.utils.json_to_sheet(changeDetails);
            XLSX.utils.book_append_sheet(workbook, detailsSheet, 'Changes');
        }

        /* Generate Buffer */
        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        return buffer;

    } catch (error) {
        throw new Error(`Excel generation failed: ${error.message}`);
    }
}

/**
 * Generate bulk export Excel from multiple backups
 * @param {Array} backups - Array of ChangeLogBackups records
 * @param {Map} backupItemsMap - Map of backupId -> array of items
 * @returns {Buffer} Excel file buffer
 */
function generateBulkExcelExport(backups, backupItemsMap) {
    try {
        const workbook = XLSX.utils.book_new();

        /* Flatten all backups into summary rows */
        const summaryRows = backups.map(backup => ({
            'IDOC Number': backup.docnum,
            'Message Type': backup.mestyp,
            'IDOC Type': backup.idoctp,
            'Initial Status': backup.initialStatus,
            'Changed Status': backup.changedStatus,
            'System': backup.systemAlias,
            'Landscape': backup.landscape,
            'Changed By': backup.changedBy,
            'Changed At': backup.changedAt ? new Date(backup.changedAt).toISOString() : '',
            'Description': backup.processDescription || '',
            'Backup Status': backup.backupStatus,
            'DMS Ref': backup.dmsRefId || '',
        }));

        const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Backups');

        /* Flatten all items into change log */
        const allChanges = [];
        for (const backup of backups) {
            const items = backupItemsMap.get(backup.ID) || [];
            items.forEach((item, idx) => {
                allChanges.push({
                    'IDOC Number': backup.docnum,
                    'Segment': item.segment,
                    'Field': item.field,
                    'Old Value': item.oldValue,
                    'New Value': item.newValue,
                    'Line': idx + 1,
                });
            });
        }

        if (allChanges.length > 0) {
            const changesSheet = XLSX.utils.json_to_sheet(allChanges);
            XLSX.utils.book_append_sheet(workbook, changesSheet, 'All Changes');
        }

        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        return buffer;

    } catch (error) {
        throw new Error(`Bulk Excel generation failed: ${error.message}`);
    }
}

/**
 * Generate filename for backup
 * Format: IDOC_Re_Processing_log_{YYYY-MM-DD_HH-mm-ss}.xlsx
 */
function generateBackupFilename(docnum, timestamp) {
    const dateStr = timestamp ? moment(timestamp).format('YYYY-MM-DD_HH-mm-ss') : moment().format('YYYY-MM-DD_HH-mm-ss');
    return `IDOC_Re_Processing_log_${dateStr}.xlsx`;
}

module.exports = {
    generateExcelBackup,
    generateBulkExcelExport,
    generateBackupFilename
};
