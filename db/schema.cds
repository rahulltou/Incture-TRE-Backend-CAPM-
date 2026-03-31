namespace ZTR_Backend_1;
using { cuid, managed, temporal } from '@sap/cds/common';

// @odata.draft.enabled

// Master/Configurable Data
entity MessageTypesForMetadata : cuid, managed {
  // sapLandscape : String(20);     // ECC, S4HANA
  sapLandscape : String(20) default 'S4HANA';
  systemAlias  : String(30);          // e.g. S4_DEV, ECC_QA
  messageType  : String(30);
  active       : Boolean default true;

  
  metadataLoaded : Boolean default false;
  lastLoadedAt   : Timestamp;
}

entity ErrorCodes : cuid, managed {
  // errorCode    : String(10); // IDOC Error Codes
  errorCode    : String(10) default '51';
  description  : String(255);
  active       : Boolean default true;
}

entity SchedulerConfig : cuid, managed {
  // schedulerName : String(30);   // e.g. Scheduler_1
  schedulerName : String(30) default '2';
  intervalHours : Integer;      // Whole number only
  active        : Boolean default true;
}

// Metadata Staging
entity MessageTypes : cuid, managed, temporal {
  // @Capabilities.SearchRestrictions.Searchable : true
  sapLandscape : String(20);
  systemAlias  : String(30);
  messageType  : String(30);
  description  : String(255);

  idocTypes    : Composition of many IdocTypes
                   on idocTypes.parent = $self;
}

entity IdocTypes : cuid, managed, temporal {
  parent    : Association to MessageTypes;
  idocType  : String(30);
  version   : String(10);

  segments  : Composition of many Segments
                on segments.parent = $self;
}

entity Segments : cuid, managed, temporal {
  parent         : Association to IdocTypes;
  segmentName    : String(30);
  segmentDescription  : String(255);
  parentSegment  : String(30);
  level          : Integer;
  repeatable     : Boolean default true;

  fields         : Composition of many Fields
                     on fields.parent = $self;
}

entity Fields : cuid, managed, temporal {
  parent       : Association to Segments;
  fieldName    : String(30);
  label        : String(255);
  dataType     : String(10);
  length       : Integer;
  decimals     : Integer default 0;
  mandatory    : Boolean default false;
  editable     : Boolean default true;
  visible      : Boolean default true;
  startOffset  : Integer;
  endOffset    : Integer;
  valueHelp    : String(100);
}


/**
 * Failed IDoc Header (EDIDC)
 * Snapshot persisted from SAP
 */
entity FailedIdocHeaders : cuid, managed {

  docnum       : String(16);      // EDIDC-DOCNUM
  mestyp       : String(30);      // Message Type
  idoctp       : String(30);      // IDoc Type
  status       : String(2);       // Status (e.g. 51)

  landscape    : String(50);      // SAP Product / Release (ECC / S4OP2021 / S4C)
  systemAlias  : String(16);      // System ID + Client

  createdOn    : Date;
  createdTime  : Time;
  sender       : String(30);
  receiver     : String(30);

  errorFlag    : Boolean default true;
}