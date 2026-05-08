using {ZTR_Backend_1 as my} from '../db/schema.cds';

@path: '/service/zTR_Backend_1'
// @requires: 'authenticated-user'
// @requires: ['TRE.CONFIG.ADMIN', 'TRE.EXECUTION.EXECUTE']  ← temporarily bypassed
service tRE_Admin {

  // @odata.draft.enabled
  // @requires: 'TRE.CONFIG.ADMIN'  ← temporarily bypassed
  @Search.searchable: true
  entity MessageTypesForMetadata as projection on my.MessageTypesForMetadata
    actions {
      action loadMetadata(messageType: String,
                          systemAlias: String) returns {
        messageType : String;
        systemAlias : String;
        status      : String;
        idocTypes   : Integer;
        segments    : Integer;
        fields      : Integer;
      };
    };

  // @odata.draft.enabled
  @Search.searchable: true
  entity ErrorCodes              as projection on my.ErrorCodes;

  // @odata.draft.enabled
  // @requires: 'TRE.CONFIG.ADMIN'  ← temporarily bypassed
  @Search.searchable: true
  entity SchedulerConfig         as projection on my.SchedulerConfig;

}
