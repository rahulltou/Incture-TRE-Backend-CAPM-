const cds = require('@sap/cds');
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');

/* ----- Local test toggle ----- */
const USE_MOCK_METADATA = process.env.USE_MOCK_METADATA === 'true';

module.exports = function (srv) {

    const {
        MessageTypesForMetadata,
        MessageTypes,
        IdocTypes,
        Segments,
        Fields
    } = cds.entities("ZTR_Backend_1");

    // const { MessageTypesForMetadata, MessageTypes, IdocTypes, Segments, Fields } = srv.entities;

    srv.on('loadMetadata', 'MessageTypesForMetadata', async (req) => {
        debugger;

        // const { messageType, systemAlias } = req.data;
        // const tx = cds.tx(req);

        // /* 1. Validate admin config */
        // const admin = await tx.run(
        //     SELECT.one.from(MessageTypesForMetadata)
        //         .where({ messageType, systemAlias })
        // );

        // if (!admin) {
        //     req.error(400, 'Message Type not maintained for system');
        // }

        // For a bound action, 'req.params' contains the ID of the row clicked
        const ID = req.params[0].ID || req.params[0];
        const tx = cds.tx(req);

        /* 1. Get the current record using the bound ID */
        const admin = await tx.run(
            SELECT.one.from(MessageTypesForMetadata).where({ ID })
        );

        if (!admin) {
            return req.error(404, 'Configuration record not found');
        }

        // Use admin.messageType and admin.systemAlias for your logic...
        const { messageType, systemAlias } = admin;

        /* 2. Inactive → delete metadata */
        if (!admin.active) {
            await deleteMetadata(tx, admin);
            await tx.run(
                UPDATE(MessageTypesForMetadata)
                    .set({ metadataLoaded: false, lastLoadedAt: null })
                    .where({ ID: admin.ID })
            );
            return result(admin, 'INACTIVE_METADATA_REMOVED');
        }

        /* 3. Already loaded → skip */
        if (admin.metadataLoaded) {
            return result(admin, 'ALREADY_LOADED');
        }

        /* 4. Resolve destination */
        const destinationName =
            admin.sapLandscape === 'ECC'
                ? `ECC_IDOC_METADATA_${admin.systemAlias}`
                : `S4_IDOC_METADATA_${admin.systemAlias}`;

        /* 5. Call Metadata OData */

        /* --Start -> Need to Uncomment after Odata Available-------- */
        // const response = await executeHttpRequest(
        //   { destinationName },
        //   {
        //     method: 'GET',
        //     url:
        //       `/sap/opu/odata/sap/Z_IDOC_META_SRV/GetMetadataSet` +
        //       `?$filter=MESTYP eq '${messageType}'`
        //   }
        // );

        // const rows = response?.data?.d?.results ?? [];
        /* --End -> Need to Uncomment after Odata Available-------- */

        let rows = [];

        if (USE_MOCK_METADATA) {
            rows = getMockMetadata(messageType);
        } else {
            const response = await executeHttpRequest(
                { destinationName },
                {
                    method: 'GET',
                    url:
                        `/sap/opu/odata/sap/Z_IDOC_META_SRV/GetMetadataSet` +
                        `?$filter=MESTYP eq '${messageType}'`
                }
            );
            rows = response?.data?.d?.results ?? [];
        }

        if (!rows.length) {
            return result(admin, 'NO_METADATA_FOUND');
        }

        /* 6. Persist metadata with FULL FIELD ATTRIBUTES */
        const counts = await persistMetadata(tx, admin, rows);

        /* 7. Mark as loaded */
        await tx.run(
            UPDATE(MessageTypesForMetadata)
                .set({ metadataLoaded: true, lastLoadedAt: new Date() })
                .where({ ID: admin.ID })
        );

        // return { ...result(admin, 'LOADED'), ...counts };

        return {
            messageType: admin.messageType,
            systemAlias: admin.systemAlias,
            status: 'SUCCESS',
            IdocTypes: counts.idocTypes,
            Segments: counts.segments,
            Fields: counts.fields
            // idocTypes: 1, 
            // segments: 5,  
            // fields: 20    
        };

    });
    // };

    /* ---------------- Helpers ---------------- */

    function result(admin, status) {
        return {
            messageType: admin.messageType,
            systemAlias: admin.systemAlias,
            status,
            idocTypes: 0,
            segments: 0,
            fields: 0
        };
    }

    async function deleteMetadata(tx, admin) {
        await tx.run(DELETE.from(Fields)
            .where({
                parent_parent_parent_messageType: admin.messageType,
                parent_parent_parent_systemAlias: admin.systemAlias
            }));
        await tx.run(DELETE.from(Segments)
            .where({
                parent_parent_messageType: admin.messageType,
                parent_parent_systemAlias: admin.systemAlias
            }));
        await tx.run(DELETE.from(IdocTypes)
            .where({
                parent_messageType: admin.messageType,
                parent_systemAlias: admin.systemAlias
            }));
        await tx.run(DELETE.from(MessageTypes)
            .where({
                messageType: admin.messageType,
                systemAlias: admin.systemAlias
            }));
    }

    async function persistMetadata(tx, admin, rows) {

        let idocs = 0, segments = 0, fields = 0;

        const msg = await tx.run(
            INSERT.into(MessageTypes).entries({
                sapLandscape: admin.sapLandscape,
                systemAlias: admin.systemAlias,
                messageType: admin.messageType,
                description: admin.messageType,

                validFrom: new Date(),
                validTo: null
            })
        );

        const grouped = {};
        for (const r of rows) {
            grouped[r.IDOCTYP] ??= [];
            grouped[r.IDOCTYP].push(r);
        }

        for (const [idocType, segs] of Object.entries(grouped)) {
            idocs++;

            const idoc = await tx.run(
                INSERT.into(IdocTypes).entries({
                    parent_ID: msg.ID,
                    idocType,
                    version: '1',

                    validFrom: new Date(),
                    validTo: null
                })
            );

            for (const s of segs) {
                segments++;

                const seg = await tx.run(
                    INSERT.into(Segments).entries({
                        parent_ID: idoc.ID,
                        segmentName: s.SEGMENT,
                        segmentDescription: s.SEGMENT_DESC ?? s.SEGMENT,
                        parentSegment: s.PARENT_SEGMENT ?? '',
                        level: s.LEVEL ?? 1,
                        repeatable: s.REPEATABLE ?? true,

                        validFrom: new Date(),
                        validTo: null
                    })
                );

                for (const f of s.FIELDS ?? []) {
                    fields++;

                    await tx.run(
                        INSERT.into(Fields).entries({
                            parent_ID: seg.ID,
                            fieldName: f.FIELDNAME,
                            label: f.LABEL ?? f.FIELDNAME,
                            dataType: f.DATATYPE ?? 'CHAR',
                            length: f.LENGTH ?? 0,
                            decimals: f.DECIMALS ?? 0,
                            mandatory: !!f.MANDATORY,
                            editable: true,
                            visible: true,
                            startOffset: f.OFFSET_FROM ?? null,
                            endOffset: f.OFFSET_TO ?? null,
                            valueHelp: f.VALUEHELP ?? null,

                            validFrom: new Date(),
                            validTo: null
                        })
                    );
                }
            }
        }

        return { idocTypes: idocs, segments, fields };
    }

    function getMockMetadata(messageType) {
        return [
            {
                IDOCTYP: `${messageType}05`,
                SEGMENT: 'E1HEADER',
                PARENT_SEGMENT: '',
                LEVEL: 1,
                REPEATABLE: false,
                FIELDS: [
                    {
                        FIELDNAME: 'DOCNUM',
                        LABEL: 'Document Number',
                        DATATYPE: 'CHAR',
                        LENGTH: 16,
                        DECIMALS: 0,
                        MANDATORY: true,
                        OFFSET_FROM: 0,
                        OFFSET_TO: 15,
                        VALUEHELP: null
                    },
                    {
                        FIELDNAME: 'DOCDATE',
                        LABEL: 'Document Date',
                        DATATYPE: 'DATS',
                        LENGTH: 8,
                        DECIMALS: 0,
                        MANDATORY: true,
                        OFFSET_FROM: 16,
                        OFFSET_TO: 23,
                        VALUEHELP: null
                    }
                ]
            },
            {
                IDOCTYP: `${messageType}05`,
                SEGMENT: 'E1ITEM',
                PARENT_SEGMENT: 'E1HEADER',
                LEVEL: 2,
                REPEATABLE: true,
                FIELDS: [
                    {
                        FIELDNAME: 'MATNR',
                        LABEL: 'Material Number',
                        DATATYPE: 'CHAR',
                        LENGTH: 18,
                        DECIMALS: 0,
                        MANDATORY: true,
                        OFFSET_FROM: 0,
                        OFFSET_TO: 17,
                        VALUEHELP: 'MATNR'
                    },
                    {
                        FIELDNAME: 'MENGE',
                        LABEL: 'Quantity',
                        DATATYPE: 'QUAN',
                        LENGTH: 13,
                        DECIMALS: 3,
                        MANDATORY: true,
                        OFFSET_FROM: 18,
                        OFFSET_TO: 30,
                        VALUEHELP: null
                    }
                ]
            }
        ];
    }

};