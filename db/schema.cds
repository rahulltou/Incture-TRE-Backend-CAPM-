namespace ZTR_Backend_1;

using {
  cuid,
  managed,
  temporal
} from '@sap/cds/common';

// @odata.draft.enabled


//IDOC Type Definitions
type EDIDC {
  DOCNUM  : String(16);
  MESTYP  : String(30);
  IDOCTYP : String(30);
  DIRECT  : String(1);
  RCVPRN  : String(10);
  SNDPRN  : String(10);
  STATUS  : String(2);
}

type EDIDD {
  DOCNUM : String(16);
  SEGNUM : String(6);
  SEGNAM : String(30);
  PSGNUM : String(6);
  HLEVEL : Integer;
  DTINT2 : String(5);
  SDATA  : String(1000);
}

type IDocPayload {
  CONTROL : EDIDC;
  DATA    : many EDIDD;
}

// Master/Configurable Data
entity MessageTypesForMetadata : cuid, managed {
  sapLandscape   : String(20) default 'S4HANA'; // ECC, S4HANA
  systemAlias    : String(30); // e.g. S4_DEV, ECC_QA
  messageType    : String(30); // e.g. ORDERS, MATMAS
  idocType       : String(30); // e.g. ORDERS05, MATMAS05, CREMAS03
  active         : Boolean default true;

  metadataLoaded : Boolean default false;
  lastLoadedAt   : Timestamp;
}

entity ErrorCodes : cuid, managed {
  errorCode   : String(10) default '51'; // IDOC Error Codes (e.g. 51, 56)
  systemAlias : String(30); // e.g. S4H210, DE1200
  description : String(255);
  active      : Boolean default true;
}

entity SchedulerConfig : cuid, managed {
  schedulerName : String(30) default '2'; // e.g. TRE 1, TRE 2
  systemAlias   : String(30); // e.g. S4H210, DE1200
  intervalHours : Integer; // Whole number only
  active        : Boolean default true;
}

// Metadata Staging
// entity MessageTypes : cuid, managed, temporal {
entity MessageTypes : cuid, managed {
  // @Capabilities.SearchRestrictions.Searchable : true
  sapLandscape : String(20);
  systemAlias  : String(30);
  messageType  : String(30);
  description  : String(255);

  idocTypes    : Composition of many IdocTypes
                   on idocTypes.parent = $self;
}

// entity IdocTypes : cuid, managed, temporal {
entity IdocTypes : cuid, managed {
  parent      : Association to MessageTypes;
  idocType    : String(30);
  description : String(255);
  version     : String(10);

  segments    : Composition of many Segments
                  on segments.parent = $self;
}

// entity Segments : cuid, managed, temporal {
entity Segments : cuid, managed {
  parent             : Association to IdocTypes;
  segmentName        : String(30);
  segmentDescription : String(255);
  Qualf              : Boolean;
  parentSegment      : String(30);
  level              : Integer;
  repeatable         : Boolean default true;
  ParentSegNum       : String;
  SegMustFlg         : Boolean;
  SegOccmax          : String;

  fields             : Composition of many Fields
                         on fields.parent = $self;
}

// entity Fields : cuid, managed, temporal {
entity Fields : cuid, managed {
  parent      : Association to Segments;
  fieldName   : String(30);
  label       : String(255);
  dataType    : String(10);
  length      : Integer;
  decimals    : Integer default 0;
  mandatory   : Boolean default false;
  editable    : Boolean default true;
  visible     : Boolean default true;
  startOffset : Integer;
  endOffset   : Integer;
  valueHelp   : String(100);
}


/**
 * Failed IDoc Header (EDIDC)
 * Snapshot persisted from SAP
 */
entity FailedIdocHeaders : cuid, managed {

  docnum           : String(16); // EDIDC-DOCNUM
  mestyp           : String(30); // Message Type
  idoctp           : String(30); // IDoc Type
  status           : String(2); // Error Status Code (e.g. 51, 56)

  landscape        : String(50); // SAP Product / Release
  systemAlias      : String(64); // BTP Destination name

  createdOn        : String(50);
  createdTime      : String(50);
  sender           : String(30); // Source system
  receiver         : String(30); // Destination system

  errorFlag        : Boolean default true;
  processingStatus : String(20) default 'Failed'; // Failed / Submitted / Successful
  items            : Composition of many FailedIdocItems
                       on items.parent = $self;
}

/**
 * Failed IDoc Segment Data (EDIDD)
 * Persisted to avoid making external calls when viewing IDoc details
 */
entity FailedIdocItems : cuid, managed {
  parent : Association to FailedIdocHeaders;
  docnum : String(16);
  segnum : String(6);
  segnam : String(27);
  psgnum : String(6);
  hlevel : String(2);
  status : String(2);
  sdata  : String(1000);
}

entity ReprocessHeaders : cuid, managed {
  docnum           : String(16);
  changedBy        : String(50);
  changedAt        : Timestamp;

  currentStatus    : String(20); // IDOC status at submission time
  reprocessStatus  : String(20); // SUBMITTED / FAILED / RE-PROCESSED
  reprocessMessage : String(255);
  toBeStatus       : String(2);
  items            : Composition of many ReprocessItems
                       on items.parent = $self;
}

entity ReprocessItems : cuid, managed {
  parent   : Association to ReprocessHeaders;

  segment  : String(30);
  field    : String(30);
  oldValue : String(255);
  newValue : String(255);
}
