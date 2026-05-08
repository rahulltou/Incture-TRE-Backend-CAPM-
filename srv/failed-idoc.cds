using {ZTR_Backend_1 as db} from '../db/schema.cds';

@path: '/service/zTR_Backend_1/failed-idoc'
// @requires: 'TRE.EXECUTION.EXECUTE'   ← uncomment to restrict to authenticated users with this role
service FailedIdocService {

  /**
   * Persisted Failed IDOCs (Header)
   * Read by UI & external APIs — detail/list view
   */
  @readonly
  @cds.redirection.target
  entity FailedIdocHeaders as projection on db.FailedIdocHeaders;

  @readonly
  entity FailedIdocItems as projection on db.FailedIdocItems;

  /**
   * IDoc Correction Dashboard — grouped summary view
   * Aggregates failed IDocs by IDoc Type, Message Type, System Alias, Error Status Code
   */
  @readonly
  @Search.searchable: true
  entity FailedIdocSummary as select from db.FailedIdocHeaders {
    @Search.defaultSearchElement: true
    key idoctp        as idocType,
    @Search.defaultSearchElement: true
    key mestyp        as messageType,
    @Search.defaultSearchElement: true
    key landscape,
    @Search.defaultSearchElement: true
    key status        as errorStatusCode,
    key cast(createdAt as Date) as date : Date,
    count(*)          as numberOfIdocs : Integer
  }
  group by idoctp, mestyp, landscape, status, cast(createdAt as Date);

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

  /**
   * Fetch IDoc segment data (EDIDD) from SAP for a specific IDoc
   * Used by the "View IDoc Data" screen
   */
  action getIdocData(docnum: String, systemAlias: String) returns String; // returns JSON string of segments
}