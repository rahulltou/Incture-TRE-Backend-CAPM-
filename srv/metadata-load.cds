using {ZTR_Backend_1 as my} from '../db/schema.cds';
// using from './service';

// extend service tRE_Admin {
@path: '/service/zTR_Backend_1/metadata'

service tRE_Metadata {
  /* =======================================================
       METADATA READ (STAGING TABLES)
       ======================================================= */

  @readonly
  @odata.draft.enabled: false
  @cds.persistence.skip
  @cds.temporal       : false
  @Search.searchable  : true
  @requires           : [
    'TRE.CONFIG.ADMIN',
    'TRE.EXECUTION.EXECUTE'
  ]
  entity MessageTypes as projection on my.MessageTypes;

  @readonly
  @cds.temporal     : false
  @Search.searchable: true
  @requires         : [
    'TRE.CONFIG.ADMIN',
    'TRE.EXECUTION.EXECUTE'
  ]
  entity IdocTypes    as projection on my.IdocTypes;

  @readonly
  @cds.temporal     : false
  @Search.searchable: true
  @requires         : [
    'TRE.CONFIG.ADMIN',
    'TRE.EXECUTION.EXECUTE'
  ]
  entity Segments     as projection on my.Segments;

  @readonly
  @cds.temporal     : false
  @Search.searchable: true
  @requires         : [
    'TRE.CONFIG.ADMIN',
    'TRE.EXECUTION.EXECUTE'
  ]
  entity Fields       as projection on my.Fields;

// /**
//  * Load IDoc metadata for a given Message Type + System
//  * Behavior:
//  *  - active=true  & not loaded  → load
//  *  - active=true  & loaded      → skip
//  *  - active=false & loaded      → delete
//  */
// action loadMetadata(
//   messageType : String,
//   systemAlias : String
// ) returns {
//   messageType : String;
//   systemAlias : String;
//   status      : String;
//   idocTypes   : Integer;
//   segments    : Integer;
//   fields      : Integer;
// };

}
