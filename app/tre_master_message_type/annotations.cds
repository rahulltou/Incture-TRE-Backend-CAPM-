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
                Value : systemAlias,
                Label : 'systemAlias',
            },
            {
                $Type : 'UI.DataField',
                Label : 'messageType',
                Value : messageType,
            },
            {
                $Type : 'UI.DataField',
                Label : 'active',
                Value : active,
            },
            {
                $Type : 'UI.DataField',
                Value : metadataLoaded,
                Label : 'metadataLoaded',
            },
            {
                $Type : 'UI.DataField',
                Value : lastLoadedAt,
                Label : 'lastLoadedAt',
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
            Value : systemAlias,
            Label : 'systemAlias',
        },
        {
            $Type : 'UI.DataField',
            Label : 'messageType',
            Value : messageType,
        },
        {
            $Type : 'UI.DataField',
            Label : 'active',
            Value : active,
        },
        {
            $Type : 'UI.DataField',
            Value : metadataLoaded,
            Label : 'metadataLoaded',
        },
        {
            $Type : 'UI.DataField',
            Value : lastLoadedAt,
            Label : 'lastLoadedAt',
        },
    ],
    UI.SelectionFields : [
        messageType,
        sapLandscape,
        systemAlias,
        active,
        metadataLoaded,
    ],
);

annotate service.MessageTypesForMetadata with {
    messageType @Common.Label : 'messageType'
};

annotate service.MessageTypesForMetadata with {
    sapLandscape @Common.Label : 'sapLandscape'
};

annotate service.MessageTypesForMetadata with {
    systemAlias @Common.Label : 'systemAlias'
};

annotate service.MessageTypesForMetadata with {
    active @Common.Label : 'active'
};

annotate service.MessageTypesForMetadata with {
    metadataLoaded @Common.Label : 'metadataLoaded'
};

