using {ZTR_Backend_1 as db} from '../db/schema.cds';

@path: '/service/zTR_Backend_1/failed-idoc'
// @requires: 'TRE.EXECUTION.EXECUTE'   ← uncomment to restrict to authenticated users with this role
service FailedIdocService {

  /**
   * Persisted Failed IDOCs (Header)
   * Read by UI & external APIs
   * Populated by the scheduler via loadFailedIdocHeaders
   */
  @readonly
  entity FailedIdocHeaders as projection on db.FailedIdocHeaders;

  /**
   * Load Failed IDOC Headers from SAP
   * Called by: scheduler (on startup + interval), admin manual trigger
   * Reads: MessageTypesForMetadata + ErrorCodes config
   * Writes: FailedIdocHeaders (upsert)
   */
  action loadFailedIdocHeaders() returns {
    loaded : Integer;
    status : String;
  };
}