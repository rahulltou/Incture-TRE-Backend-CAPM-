const cds = require("@sap/cds");
// const { executeHttpRequest } = require("@sap-cloud-sdk/http-client");

/* Toggle for mock metadata testing */
const USE_MOCK_METADATA = process.env.USE_MOCK_METADATA === "true";

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
        const tx = cds.tx(req);

        /* 1: Get configuration row */
        const admin = await tx.run(
            SELECT.one.from(MessageTypesForMetadata).where({ ID })
        );

        if (!admin) return req.error(404, "Configuration record not found");

        const { messageType, systemAlias } = admin;

        /* 2: If inactive → delete metadata */
        if (!admin.active) {
            await deleteMetadata(tx, admin);
            await tx.run(
                UPDATE(MessageTypesForMetadata)
                    .set({ metadataLoaded: false, lastLoadedAt: null })
                    .where({ ID: admin.ID })
            );
            return result(admin, "INACTIVE_METADATA_REMOVED");
        }

        /* 3: If already loaded → skip */
        if (admin.metadataLoaded)
            return result(admin, "ALREADY_LOADED");

        /**********************************************
         * 4: READ METADATA FROM SAP ODATA (EDMX) OR MOCK
         *********************************************/
        let rows = [];

        // let USE_MOCK_METADATA_local = 'X';
        if (USE_MOCK_METADATA) {
        // if (USE_MOCK_METADATA_local) {
            rows = getMockMetadata(messageType);
        } else {
            try {               
                const extSrv = await cds.connect.to(admin.systemAlias, {
                    kind: "odata-v2",
                    model: "srv/external/ZIDOC_METADATA_SRV"
                });

                // READ SEGMENT METADATA FROM EDMX ODATA MODEL
                const sapSegments = await extSrv.run(
                    SELECT.from("MESTYPINFOSet").where({ Mestyp: messageType })
                );

                rows = transformEdmxSegmentsToLegacyRows(sapSegments);
            } catch (err) {
                return req.error(
                    500,
                    `Failed to fetch SAP metadata for ${messageType}: ${err.message}`
                );
            }
        }

        if (!rows.length) return result(admin, "NO_METADATA_FOUND");

        /**********************************************
         * 5: PERSIST METADATA EXACTLY LIKE EXISTING LOGIC
         *********************************************/
        const counts = await persistMetadata(tx, admin, rows);

        /* 6: Mark record as loaded */
        await tx.run(
            UPDATE(MessageTypesForMetadata)
                .set({ metadataLoaded: true, lastLoadedAt: new Date() })
                .where({ ID: admin.ID })
        );

        return {
            messageType: admin.messageType,
            systemAlias: admin.systemAlias,
            status: "SUCCESS",
            IdocTypes: counts.idocTypes,
            Segments: counts.segments,
            Fields: counts.fields,
        };
    });

    /**********************************************
     * DELETE METADATA (unchanged)
     *********************************************/
    async function deleteMetadata(tx, admin) {
        await tx.run(
            DELETE.from(Fields).where({
                parent_parent_parent_messageType: admin.messageType,
                parent_parent_parent_systemAlias: admin.systemAlias,
            })
        );

        await tx.run(
            DELETE.from(Segments).where({
                parent_parent_messageType: admin.messageType,
                parent_parent_systemAlias: admin.systemAlias,
            })
        );

        await tx.run(
            DELETE.from(IdocTypes).where({
                parent_messageType: admin.messageType,
                parent_systemAlias: admin.systemAlias,
            })
        );

        await tx.run(
            DELETE.from(MessageTypes).where({
                messageType: admin.messageType,
                systemAlias: admin.systemAlias,
            })
        );
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

            // Process Fields
            if (seg.ToFields?.results) {
                for (const fld of seg.ToFields.results) {
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

    async function persistMetadata(tx, admin, rows) {
        let idocs = 0,
            segments = 0,
            fields = 0;

        /*********************************************************
         * 1️⃣ MESSAGE TYPE ROOT (SAFE EXTRACT)
         * - Collect all distinct messageType descriptions from rows
         * - Pick the FIRST valid one (SAP sends same for all segments)
         *********************************************************/
        const msgDescriptions = rows
            .map(r => r.MESTYP_DESC)
            .filter(d => d && d !== "");

        const messageTypeDesc =
            msgDescriptions.length > 0 ? msgDescriptions[0] : admin.messageType;

        const messageTypeId = uuid();

        await tx.run(
            INSERT.into(MessageTypes).entries({
                ID: messageTypeId,
                sapLandscape: admin.sapLandscape,
                systemAlias: admin.systemAlias,
                messageType: admin.messageType,
                description: messageTypeDesc,     // ✔ always correct now
                validFrom: new Date("2000-01-01"),
                validTo: null
            })
        );

        /*********************************************************
         * 2️⃣ GROUP SEGMENTS BY IDOCTYP (SAP MULTIPLE IDOCs)
         *********************************************************/
        const grouped = {};
        for (const r of rows) {
            if (!grouped[r.IDOCTYP]) grouped[r.IDOCTYP] = [];
            grouped[r.IDOCTYP].push(r);
        }

        /*********************************************************
         * 3️⃣ PROCESS EACH IDOC TYPE
         *********************************************************/
        for (const [idocType, segs] of Object.entries(grouped)) {
            idocs++;

            /*******************************************************
             * Extract IDocType Description (SAFE)
             * Search every segment for IDOCTYP_DESC
             *******************************************************/
            const idocDescriptions = segs
                .map(s => s.IDOCTYP_DESC)
                .filter(d => d && d !== "");

            const idocTypeDesc =
                idocDescriptions.length > 0 ? idocDescriptions[0] : idocType;

            const idocTypeId = uuid();

            await tx.run(
                INSERT.into(IdocTypes).entries({
                    ID: idocTypeId,
                    parent_ID: messageTypeId,
                    idocType,
                    description: idocTypeDesc,  // ✔ safe & correct
                    version: "1",
                    validFrom: new Date("2000-01-01"),
                    validTo: null
                })
            );

            /*********************************************************
             * 4️⃣ INSERT SEGMENTS FOR THIS IDOC TYPE
             *********************************************************/
            for (const s of segs) {
                segments++;

                const segmentId = uuid();

                await tx.run(
                    INSERT.into(Segments).entries({
                        ID: segmentId,
                        parent_ID: idocTypeId,

                        segmentName: s.SEGMENT,
                        segmentDescription: s.SEGMENT_DESC ?? s.SEGMENT,

                        parentSegment: s.PARENT_SEGMENT ?? null,
                        parentSegNum: s.PARENT_SEGNUM ?? null,
                        segMustFlg: s.SEGMUSTFLG ?? false,
                        segOccmax: s.SEGOCCMAX ?? null,

                        level: s.LEVEL ?? 1,
                        repeatable: s.REPEATABLE ?? true,

                        validFrom: new Date(),
                        validTo: null
                    })
                );

                /*********************************************************
                 * 5️⃣ INSERT FIELDS FOR THIS SEGMENT
                 *********************************************************/
                for (const f of s.FIELDS ?? []) {
                    fields++;

                    await tx.run(
                        INSERT.into(Fields).entries({
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
                            valueHelp: f.VALUEHELP ?? null,

                            validFrom: new Date(),
                            validTo: null
                        })
                    );
                }
            }
        }

        /*********************************************************
         * 6️⃣ FINAL RETURN (your existing structure)
         *********************************************************/
        return {
            idocTypes: idocs,
            segments,
            fields
        };
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