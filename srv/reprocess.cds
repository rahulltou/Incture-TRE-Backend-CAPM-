using {ZTR_Backend_1 as db} from '../db/schema.cds';

/* ---------- Reprocess Service ---------- */
@path: '/service/zTR_Backend_1/reprocess'
@requires: 'TRE.EXECUTION.EXECUTE'
service ReprocessService {

  /* Read-only history for UI */
  @readonly
  entity ReprocessHeaders as projection on db.ReprocessHeaders;

  @readonly
  entity ReprocessItems   as projection on db.ReprocessItems;

  /* UI submits IDOC + corrections */
  action submitReprocessAttempt(payload: db.IDocPayload,
                                changedBy: String,
                                systemAlias: String,
                                changes: many {
    segment   : String;
    field     : String;
    oldValue  : String;
    newValue  : String;
  })                                                     returns {
    attemptId : UUID;
    status    : String;
  };

  /* CPI callback */
  action updateReprocessResult(attemptId: UUID,
                               idocStatus: String,
                               reprocessMessage: String) returns {
    status : String;
  };

  // /* Archive completed IDOC */
  //   action archiveReprocessed (
  //     docnum : String
  //   )
  //   returns {
  //     status : String;
  //   };
  // }

  /* Archive completed IDOCs - Job Triggered */
  action archiveReprocessed() returns {
    archivedCount : Integer;
    status        : String;
  };

}
