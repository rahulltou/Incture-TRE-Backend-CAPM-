using {ZTR_Backend_1 as db} from '../db/schema.cds';

/* ---------- Change Log Backup Service (DMS/CMS Integration) ---------- */
@path: '/service/zTR_Backend_1/change-log-backup'
// @requires: 'TRE.EXECUTION.EXECUTE'
service ChangeLogBackupService {

    /* Read-only backups for UI */
    @readonly
    @Search.searchable: true
    entity ChangeLogBackups     as projection on db.ChangeLogBackups;

    @readonly
    @Search.searchable: true
    entity ChangeLogBackupItems as projection on db.ChangeLogBackupItems;

    /**
     * Create and backup a change log entry
     * - Generates Excel file
     * - Uploads to DMS/CMS
     * - Records backup metadata
     */
    action   createAndBackup(docnum: String,
                             mestyp: String,
                             idoctp: String,
                             initialStatus: String,
                             changedStatus: String,
                             changedBy: String,
                             systemAlias: String,
                             landscape: String,
                             changes: many {
        segment  : String;
        field    : String;
        oldValue : String;
        newValue : String;
    })                                          returns {
        backupId : UUID;
        status   : String;
        dmsRefId : String;
        message  : String;
    };

    /**
     * Export existing backups as Excel
     */
    action   exportBackupsToExcel(fromDate: Date,
                                  toDate: Date) returns {
        status   : String;
        fileUrl  : String;
        rowCount : Integer;
    };

    /**
     * Archive and mark as backed up to DMS/CMS
     */
    action   archiveBackup(backupId: UUID)      returns {
        status  : String;
        message : String;
    };

    /**
     * Retrieve backup details with all items
     */
    function getBackupDetails(backupId: UUID)   returns {
        backup : {
            ID                 : UUID;
            docnum             : String;
            mestyp             : String;
            idoctp             : String;
            initialStatus      : String;
            changedStatus      : String;
            changedBy          : String;
            changedAt          : Timestamp;
            systemAlias        : String;
            landscape          : String;
            processDescription : String;
            backupStatus       : String;
            dmsRefId           : String;
            dmsFileName        : String;
            backupUrl          : String;
            archivedAt         : Timestamp;
        };
        items  : many {
            ID       : UUID;
            segment  : String;
            field    : String;
            oldValue : String;
            newValue : String;
            lineNo   : Integer;
        };
    };

}
