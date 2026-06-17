using tRE_Admin as service from '../../srv/service';
annotate service.ErrorCodes with @(
    UI.FieldGroup #GeneratedGroup : {
        $Type : 'UI.FieldGroupType',
        Data : [
            {
                $Type : 'UI.DataField',
                Label : 'errorCode',
                Value : errorCode,
            },
            {
                $Type : 'UI.DataField',
                Label : 'systemAlias',
                Value : systemAlias,
            },
            {
                $Type : 'UI.DataField',
                Label : 'description',
                Value : description,
            },
            {
                $Type : 'UI.DataField',
                Label : 'active',
                Value : active,
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
            Label : 'errorCode',
            Value : errorCode,
        },
        {
            $Type : 'UI.DataField',
            Label : 'systemAlias',
            Value : systemAlias,
        },
        {
            $Type : 'UI.DataField',
            Label : 'description',
            Value : description,
        },
        {
            $Type : 'UI.DataField',
            Label : 'active',
            Value : active,
        },
    ],
);

