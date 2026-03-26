using {ZTR_Backend_1 as my} from '../db/schema.cds';

@path: '/service/zTR_Backend_1'
// @requires: 'authenticated-user'
service tRE_Admin {

  @odata.draft.enabled
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

  @odata.draft.enabled
  entity ErrorCodes              as projection on my.ErrorCodes;

  @odata.draft.enabled
  entity SchedulerConfig         as projection on my.SchedulerConfig;

}
