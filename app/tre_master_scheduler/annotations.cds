using tRE_Admin as service from '../../srv/service';
annotate service.SchedulerConfig with @(
    UI.FieldGroup #GeneratedGroup : {
        $Type : 'UI.FieldGroupType',
        Data : [
            {
                $Type : 'UI.DataField',
                Label : 'schedulerName',
                Value : schedulerName,
            },
            {
                $Type : 'UI.DataField',
                Label : 'intervalHours',
                Value : intervalHours,
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
            Label : 'schedulerName',
            Value : schedulerName,
        },
        {
            $Type : 'UI.DataField',
            Label : 'intervalHours',
            Value : intervalHours,
        },
        {
            $Type : 'UI.DataField',
            Label : 'active',
            Value : active,
        },
    ],
);

