using {ZTR_Backend_1 as db} from '../db/schema.cds';
using {Corrected_Error_EDIDC as ext} from './external/Corrected_Error_EDIDC.csn';

@path: '/service/zTR_Backend_1/failed-idoc'
@requires: 'TRE.EXECUTION.EXECUTE'
service FailedIdocService {

  /**
   * Persisted Failed IDOCs (Header)
   * Used by UI & APIs
   */
  @readonly
  entity FailedIdocHeaders as projection on db.FailedIdocHeaders;

  /**
   * External EDIDC (typed)
   * Used internally by CAP for loading
   */
  @readonly
  @cds.persistence.skip
  entity EDIDCExternal     as
    projection on ext.EDIDCSet {
      key Docnum,
          Landscape,
          SysAlias,
          Mestyp,
          Idoctp,
          Status,
          Credat,
          Cretim,
          Sndprn,
          Rcvprn
    };

  /**
   * Load Failed IDOC Headers from SAP
   * Scheduler + Admin trigger
   */
  action loadFailedIdocHeaders() returns {
    loaded : Integer;
    status : String;
  };
}
