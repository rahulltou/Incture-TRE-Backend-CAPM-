const cds = require("@sap/cds");
// const { executeHttpRequest } = require("@sap-cloud-sdk/http-client");

/* Toggle for mock metadata testing */
const USE_MOCK_METADATA = process.env.USE_MOCK_METADATA === "true";
const LOG = cds.log("metadata-load");

module.exports = function (srv) {
    const { uuid } = cds.utils;

    const {
        MessageTypesForMetadata,
        MessageTypes,
        IdocTypes,
        Segments,
        Fields,
    } = cds.entities("ZTR_Backend_1");

    /**********************************************
     * BOUND ACTION: loadMetadata(MessageTypesForMetadata)
     *********************************************/
    srv.on("loadMetadata", "MessageTypesForMetadata", async (req) => {
        const ID = req.params[0].ID || req.params[0];

        /* 1: Get configuration row — CAP 9 auto-tx, no cds.tx(req) needed */
        const admin = await SELECT.one.from(MessageTypesForMetadata).where({ ID });

        if (!admin) return req.error(404, "Configuration record not found");

        /* 2: If inactive → delete metadata */
        if (!admin.active) {
            LOG.info(`[loadMetadata] Configuration inactive for ${admin.messageType}, deleting existing metadata...`);
            await deleteMetadata(admin);
            await UPDATE(MessageTypesForMetadata)
                .set({ metadataLoaded: false, lastLoadedAt: null })
                .where({ ID: admin.ID });
            return result(admin, "INACTIVE_METADATA_REMOVED");
        }

        /* 3: Clear existing metadata before fetching fresh data */
        LOG.info(`[loadMetadata] Clearing existing metadata for ${admin.messageType} to force a fresh reload...`);
        await deleteMetadata(admin);

        /**********************************************
         * 4: READ METADATA FROM SAP ODATA OR MOCK
         *********************************************/
        let rows = [];

        if (USE_MOCK_METADATA) {
            rows = getMockMetadata(admin.messageType);
        } else {
            try {
                /* Dynamic BTP destination: admin.systemAlias must match a
                 * BTP Destination name configured in the Destination Service.
                 * Use unique serviceKey to avoid CAP connection cache clash. */
                const metaServiceKey = `ZIDOC_METADATA_SRV__${admin.systemAlias}`;

                const extSrv = await cds.connect.to(metaServiceKey, {
                    kind: "odata-v2",
                    model: "srv/external/ZIDOC_METADATA_SRV",
                    credentials: {
                        destination: admin.systemAlias,
                        // ZIDOC_METADATA_SRV.edmx is misnamed — actual SAP service
                        // containing MESTYPINFOSet is ZIDOC_ERROR_REPROCESSING_SRV
                        path: "/sap/opu/odata/sap/ZIDOC_ERROR_REPROCESSING_SRV"
                    }
                });

                // Execute query separately
                const response = await extSrv.send({
                    method: "GET",
                    path: `/MESTYPINFOSet?$filter=Mestyp eq '${admin.messageType}' and Idoctyp eq '${admin.idocType}'&$expand=ToFields&$format=json`
                });
                LOG.info(`[loadMetadata] sapSegments Response Received from ${admin.systemAlias}`);

                const sapSegments = response.d?.results || response.d || response;

                LOG.info(`[loadMetadata] Transforming SAP metadata for ${admin.messageType} into legacy format... Segment count: ${sapSegments.length} ${JSON.stringify(sapSegments)}`);

                rows = transformEdmxSegmentsToLegacyRows(sapSegments);

            } catch (err) {
                LOG.error(`[loadMetadata] Failed to fetch SAP metadata for ${admin.messageType}: ${err.message}`);
                return req.error(
                    500,
                    `Failed to fetch SAP metadata for ${admin.messageType}: ${err.message}`
                );
            }
        }

        if (!rows.length) return result(admin, "NO_METADATA_FOUND");

        /**********************************************
         * 5: PERSIST METADATA
         *********************************************/
        LOG.info(`[loadMetadata] Persisting metadata for ${admin.messageType}...`);
        const counts = await persistMetadata(admin, rows);
        LOG.info(`[loadMetadata] Metadata persisted successfully: ${JSON.stringify(counts)}`);

        /* 6: Mark record as loaded */
        await UPDATE(MessageTypesForMetadata)
            .set({ metadataLoaded: true, lastLoadedAt: new Date() })
            .where({ ID: admin.ID });

        return {
            messageType: admin.messageType,
            systemAlias: admin.systemAlias,
            status: "SUCCESS",
            idocTypes: counts.idocTypes,   // camelCase to match CDS return type
            segments: counts.segments,
            fields: counts.fields,
        };
    });

    /**********************************************
     * DELETE METADATA (unchanged)
     *********************************************/
    async function deleteMetadata(admin) {
        // Step 1: Get the parent MessageType ID
        const msgType = await SELECT.one.from(MessageTypes).where({
            messageType: admin.messageType,
            systemAlias: admin.systemAlias,
        });

        if (!msgType) return; // Nothing to delete

        // Step 2: Get all IdocType IDs
        const idocTypes = await SELECT.from(IdocTypes).where({ parent_ID: msgType.ID });
        const idocTypeIds = idocTypes.map(i => i.ID);

        if (idocTypeIds.length > 0) {
            // Step 3: Get all Segment IDs
            const segments = await SELECT.from(Segments).where({ parent_ID: { 'in': idocTypeIds } });
            const segmentIds = segments.map(s => s.ID);

            if (segmentIds.length > 0) {
                // Delete Fields
                await DELETE.from(Fields).where({ parent_ID: { 'in': segmentIds } });
            }
            // Delete Segments
            await DELETE.from(Segments).where({ parent_ID: { 'in': idocTypeIds } });
        }
        // Delete IdocTypes
        await DELETE.from(IdocTypes).where({ parent_ID: msgType.ID });
        // Delete MessageTypes
        await DELETE.from(MessageTypes).where({ ID: msgType.ID });
    }

    /**********************************************
     * TRANSFORM EDMX → LEGACY ROW STRUCTURE
     *********************************************/
    function transformEdmxSegmentsToLegacyRows(sapSegments) {
        const rows = [];

        for (const seg of sapSegments) {
            const legacy = {
                IDOCTYP: seg.Idoctyp,
                IDOCTYP_DESC: seg.IdoctypDesc,
                MESTYP: seg.Mestyp,
                MESTYP_DESC: seg.MestypDesc,

                SEGMENT: seg.Segment,
                SEGMENT_DESC: seg.SegDescrp ?? seg.Segment,
                PARENT_SEGMENT: seg.ParentSegment ?? "",
                PARENT_SEGNUM: seg.ParentSegNum ?? "",
                SEGMUSTFLG: seg.SegMustFlg ?? false,
                SEGOCCMAX: seg.SegOccmax ?? "",
                LEVEL: toInt(seg.Level),
                REPEATABLE: seg.Repeatable ?? true,
                FIELDS: []

            };

            // Process Fields (Handle both flat array and .results object)
            const sapFields = Array.isArray(seg.ToFields) ? seg.ToFields : seg.ToFields?.results;

            if (sapFields) {
                for (const fld of sapFields) {
                    legacy.FIELDS.push({
                        FIELDNAME: fld.Fieldname,
                        LABEL: fld.Label,
                        DATATYPE: fld.Datatype,
                        LENGTH: toInt(fld.Length),
                        DECIMALS: toInt(fld.Decimals),
                        MANDATORY: fld.Signflag ?? false,
                        OFFSET_FROM: toInt(fld.Offset),
                        OFFSET_TO: toInt(fld.Offset) + toInt(fld.Length) - 1,
                        VALUEHELP: fld.Valuehelp ?? null,
                    });
                }
            }

            rows.push(legacy);
        }

        return rows;
    }

    function toInt(v) {
        if (v == null) return null;
        const n = parseInt(v);
        return isNaN(n) ? null : n;
    }

    /**********************************************
     * EXISTING persistMetadata LOGIC (100% SAME)
     *********************************************/
    // async function persistMetadata(tx, admin, rows) {
    //     let idocs = 0,
    //         segments = 0,
    //         fields = 0;

    //     /************* 1. MESSAGE TYPE **************/
    //     const messageTypeId = uuid();

    //     await tx.run(
    //         INSERT.into(MessageTypes).entries({
    //             ID: messageTypeId,
    //             sapLandscape: admin.sapLandscape,
    //             systemAlias: admin.systemAlias,
    //             messageType: admin.messageType,
    //             description: rows[0].MESTYP_DESC,
    //             validFrom: new Date("2000-01-01"),
    //             validTo: null,
    //         })
    //     );

    //     /************* 2. GROUP BY IDOC TYPE ********/
    //     const grouped = {};
    //     for (const r of rows) {
    //         grouped[r.IDOCTYP] ??= [];
    //         grouped[r.IDOCTYP].push(r);
    //     }

    //     /************* 3. IDOC TYPES **************/
    //     for (const [idocType, segs] of Object.entries(grouped)) {
    //         idocs++;

    //         const idocTypeId = uuid();

    //         await tx.run(
    //             INSERT.into(IdocTypes).entries({
    //                 ID: idocTypeId,
    //                 parent_ID: messageTypeId,
    //                 idocType,
    //                 description: segs[0].IDOCTYP_DESC,
    //                 version: "1",
    //                 validFrom: new Date("2000-01-01"),
    //                 validTo: null,
    //             })
    //         );

    //         /************* 4. SEGMENTS **************/
    //         for (const s of segs) {
    //             segments++;

    //             const segmentId = uuid();

    //             await tx.run(
    //                 INSERT.into(Segments).entries({
    //                     ID: segmentId,
    //                     parent_ID: idocTypeId,
    //                     segmentName: s.SEGMENT,
    //                     segmentDescription: s.SEGMENT_DESC,
    //                     parentSegment: s.PARENT_SEGMENT,
    //                     parentSegNum: s.PARENT_SEGNUM,
    //                     segMustFlg: s.SEGMUSTFLG,
    //                     segOccmax: s.SEGOCCMAX,
    //                     level: s.LEVEL ?? 1,
    //                     repeatable: s.REPEATABLE ?? true,
    //                     validFrom: new Date(),
    //                     validTo: null,
    //                 })
    //             );

    //             /************* 5. FIELDS **************/
    //             for (const f of s.FIELDS ?? []) {
    //                 fields++;

    //                 await tx.run(
    //                     INSERT.into(Fields).entries({
    //                         ID: uuid(),
    //                         parent_ID: segmentId,
    //                         fieldName: f.FIELDNAME,
    //                         label: f.LABEL,
    //                         dataType: f.DATATYPE,
    //                         length: f.LENGTH,
    //                         decimals: f.DECIMALS,
    //                         mandatory: f.MANDATORY,
    //                         editable: true,
    //                         visible: true,
    //                         startOffset: f.OFFSET_FROM,
    //                         endOffset: f.OFFSET_TO,
    //                         valueHelp: f.VALUEHELP,
    //                         validFrom: new Date(),
    //                         validTo: null,
    //                     })
    //                 );
    //             }
    //         }
    //     }

    //     return { idocTypes: idocs, segments, fields };
    // }

    async function persistMetadata(admin, rows) {
        let idocs = 0, segments = 0, fields = 0;

        /* 1️⃣ MESSAGE TYPE ROOT */
        const msgDescriptions = rows.map(r => r.MESTYP_DESC).filter(d => d && d !== "");
        const messageTypeDesc = msgDescriptions.length > 0 ? msgDescriptions[0] : admin.messageType;
        const messageTypeId = uuid();

        await INSERT.into(MessageTypes).entries({
            ID: messageTypeId,
            sapLandscape: admin.sapLandscape,
            systemAlias: admin.systemAlias,
            messageType: admin.messageType,
            description: messageTypeDesc
            // validFrom / validTo removed — not in schema
        });

        /* 2️⃣ GROUP SEGMENTS BY IDOCTYP */
        const grouped = {};
        for (const r of rows) {
            if (!grouped[r.IDOCTYP]) grouped[r.IDOCTYP] = [];
            grouped[r.IDOCTYP].push(r);
        }

        /* 3️⃣ PROCESS EACH IDOC TYPE */
        for (const [idocType, segs] of Object.entries(grouped)) {
            idocs++;

            const idocDescriptions = segs.map(s => s.IDOCTYP_DESC).filter(d => d && d !== "");
            const idocTypeDesc = idocDescriptions.length > 0 ? idocDescriptions[0] : idocType;
            const idocTypeId = uuid();

            await INSERT.into(IdocTypes).entries({
                ID: idocTypeId,
                parent_ID: messageTypeId,
                idocType,
                description: idocTypeDesc,
                version: "1"
                // validFrom / validTo removed — not in schema
            });

            /* 4️⃣ INSERT SEGMENTS */
            for (const s of segs) {
                segments++;
                const segmentId = uuid();

                await INSERT.into(Segments).entries({
                    ID: segmentId,
                    parent_ID: idocTypeId,
                    segmentName: s.SEGMENT,
                    segmentDescription: s.SEGMENT_DESC ?? s.SEGMENT,
                    parentSegment: s.PARENT_SEGMENT ?? null,
                    ParentSegNum: s.PARENT_SEGNUM ?? null,
                    SegMustFlg: s.SEGMUSTFLG ?? false,
                    SegOccmax: s.SEGOCCMAX ?? null,
                    level: s.LEVEL ?? 1,
                    repeatable: s.REPEATABLE ?? true
                    // validFrom / validTo removed — not in schema
                });

                /* 5️⃣ INSERT FIELDS */
                for (const f of s.FIELDS ?? []) {
                    fields++;

                    await INSERT.into(Fields).entries({
                        ID: uuid(),
                        parent_ID: segmentId,
                        fieldName: f.FIELDNAME,
                        label: f.LABEL ?? f.FIELDNAME,
                        dataType: f.DATATYPE ?? "CHAR",
                        length: f.LENGTH ?? 0,
                        decimals: f.DECIMALS ?? 0,
                        mandatory: !!f.MANDATORY,
                        editable: true,
                        visible: true,
                        startOffset: f.OFFSET_FROM ?? null,
                        endOffset: f.OFFSET_TO ?? null,
                        valueHelp: f.VALUEHELP ?? null
                        // validFrom / validTo removed — not in schema
                    });
                }
            }
        }

        return { idocTypes: idocs, segments, fields };
    }



    /**********************************************
     * RESULT STRUCTURE (unchanged)
     *********************************************/
    function result(admin, status) {
        return {
            messageType: admin.messageType,
            systemAlias: admin.systemAlias,
            status,
            idocTypes: 0,
            segments: 0,
            fields: 0,
        };
    }

    /**********************************************
     * MOCK METADATA (you can insert your new EDMX sample here)
     *********************************************/
    // function getMockMetadata(messageType) {
    //     // Replace with your new sample payload for local run
    //     return [];
    // }

    function getMockMetadata(messageType) {
        // ----- IDOC TYPE 1: ORDERS05 (from your sample payload) -----
        const idoc1_seg1 = {
            IDOCTYP: `${messageType}05`,
            IDOCTYP_DESC: "Purchasing/Sales",
            MESTYP: messageType,
            MESTYP_DESC: "Purchase order / order",

            SEGMENT: "E1EDK01",
            SEGMENT_DESC: "IDoc: Document header general data",
            PARENT_SEGMENT: "",
            PARENT_SEGNUM: "0000",
            SEGMUSTFLG: true,
            SEGOCCMAX: "0000000001",
            LEVEL: 1,
            REPEATABLE: false,

            FIELDS: [
                {
                    FIELDNAME: "ACTION",
                    LABEL: "Action code for the whole EDI message",
                    DATATYPE: "CHAR",
                    LENGTH: 3,
                    DECIMALS: 0,
                    MANDATORY: false,
                    OFFSET_FROM: 63,
                    OFFSET_TO: 65,
                    VALUEHELP: ""
                },
                {
                    FIELDNAME: "CURCY",
                    LABEL: "Currency",
                    DATATYPE: "CHAR",
                    LENGTH: 3,
                    DECIMALS: 0,
                    MANDATORY: false,
                    OFFSET_FROM: 217,
                    OFFSET_TO: 219,
                    VALUEHELP: ""
                }
            ]
        };

        const idoc1_seg2 = {
            IDOCTYP: `${messageType}05`,
            IDOCTYP_DESC: "Purchasing/Sales",
            MESTYP: messageType,
            MESTYP_DESC: "Purchase order / order",

            SEGMENT: "E1EDK14",
            SEGMENT_DESC: "IDoc: Document Header Organizational Data",
            PARENT_SEGMENT: "E1EDK01",
            PARENT_SEGNUM: "0001",
            SEGMUSTFLG: false,
            SEGOCCMAX: "0000000012",
            LEVEL: 2,
            REPEATABLE: true,

            FIELDS: [
                {
                    FIELDNAME: "QUALF",
                    LABEL: "IDOC qualifier organization",
                    DATATYPE: "CHAR",
                    LENGTH: 3,
                    DECIMALS: 0,
                    MANDATORY: false,
                    OFFSET_FROM: 63,
                    OFFSET_TO: 65,
                    VALUEHELP: ""
                },
                {
                    FIELDNAME: "ORGID",
                    LABEL: "IDOC organization",
                    DATATYPE: "CHAR",
                    LENGTH: 35,
                    DECIMALS: 0,
                    MANDATORY: false,
                    OFFSET_FROM: 66,
                    OFFSET_TO: 100,
                    VALUEHELP: ""
                }
            ]
        };

        // ----- IDOC TYPE 2: DUMMY ORDERS99 (to simulate multi-idoc) -----
        const idoc2_seg1 = {
            IDOCTYP: `${messageType}99`,
            IDOCTYP_DESC: "Custom Test IDoc Type",
            MESTYP: messageType,
            MESTYP_DESC: "Purchase order / order",

            SEGMENT: "ZSEG_HDR",
            SEGMENT_DESC: "Custom Header Segment",
            PARENT_SEGMENT: "",
            PARENT_SEGNUM: "0000",
            SEGMUSTFLG: true,
            SEGOCCMAX: "0000000001",
            LEVEL: 1,
            REPEATABLE: false,

            FIELDS: [
                {
                    FIELDNAME: "DOCNUM",
                    LABEL: "Document Number",
                    DATATYPE: "CHAR",
                    LENGTH: 10,
                    DECIMALS: 0,
                    MANDATORY: true,
                    OFFSET_FROM: 0,
                    OFFSET_TO: 9,
                    VALUEHELP: ""
                },
                {
                    FIELDNAME: "DOCTYPE",
                    LABEL: "Document Type",
                    DATATYPE: "CHAR",
                    LENGTH: 4,
                    DECIMALS: 0,
                    MANDATORY: true,
                    OFFSET_FROM: 10,
                    OFFSET_TO: 13,
                    VALUEHELP: ""
                }
            ]
        };

        const idoc2_seg2 = {
            IDOCTYP: `${messageType}99`,
            IDOCTYP_DESC: "Custom Test IDoc Type",
            MESTYP: messageType,
            MESTYP_DESC: "Purchase order / order",

            SEGMENT: "ZSEG_ITEM",
            SEGMENT_DESC: "Custom Item Segment",
            PARENT_SEGMENT: "ZSEG_HDR",
            PARENT_SEGNUM: "0001",
            SEGMUSTFLG: false,
            SEGOCCMAX: "0000009999",
            LEVEL: 2,
            REPEATABLE: true,

            FIELDS: [
                {
                    FIELDNAME: "MATNR",
                    LABEL: "Material Number",
                    DATATYPE: "CHAR",
                    LENGTH: 18,
                    DECIMALS: 0,
                    MANDATORY: true,
                    OFFSET_FROM: 0,
                    OFFSET_TO: 17,
                    VALUEHELP: ""
                },
                {
                    FIELDNAME: "MENGE",
                    LABEL: "Quantity",
                    DATATYPE: "QUAN",
                    LENGTH: 13,
                    DECIMALS: 3,
                    MANDATORY: true,
                    OFFSET_FROM: 18,
                    OFFSET_TO: 30,
                    VALUEHELP: ""
                }
            ]
        };

        // return ALL FOUR segments (2 per IDOC type)
        return [idoc1_seg1, idoc1_seg2, idoc2_seg1, idoc2_seg2];
    }

};