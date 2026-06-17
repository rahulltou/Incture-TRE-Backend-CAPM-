using tRE_Admin as service from '../../srv/service';
annotate service.MessageTypesForMetadata with @(
    UI.FieldGroup #GeneratedGroup : {
        $Type : 'UI.FieldGroupType',
        Data : [
            {
                $Type : 'UI.DataField',
                Label : 'sapLandscape',
                Value : sapLandscape,
            },
            {
                $Type : 'UI.DataField',
                Label : 'systemAlias',
                Value : systemAlias,
            },
            {
                $Type : 'UI.DataField',
                Label : 'messageType',
                Value : messageType,
            },
            {
                $Type : 'UI.DataField',
                Label : 'idocType',
                Value : idocType,
            },
            {
                $Type : 'UI.DataField',
                Label : 'active',
                Value : active,
            },
            {
                $Type : 'UI.DataField',
                Label : 'metadataLoaded',
                Value : metadataLoaded,
            },
            {
                $Type : 'UI.DataField',
                Label : 'lastLoadedAt',
                Value : lastLoadedAt,
            },
        ],
    },
    UI.Facets : [
        {
            $Type : 'UI.ReferenceFacet',
            ID : 'GeneratedFacet1',
            Label : 'General Information',
            Target : '@UI.FieldGroup#GeneratedGroup',
        },
    ],
    UI.LineItem : [
        {
            $Type : 'UI.DataField',
            Label : 'sapLandscape',
            Value : sapLandscape,
        },
        {
            $Type : 'UI.DataField',
            Label : 'systemAlias',
            Value : systemAlias,
        },
        {
            $Type : 'UI.DataField',
            Label : 'messageType',
            Value : messageType,
        },
        {
            $Type : 'UI.DataField',
            Label : 'idocType',
            Value : idocType,
        },
        {
            $Type : 'UI.DataField',
            Label : 'active',
            Value : active,
        },
    ],
);

