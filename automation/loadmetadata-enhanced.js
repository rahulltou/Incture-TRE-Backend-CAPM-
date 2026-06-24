const axios = require("axios");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

const BEARER_TOKEN = "eyJ0eXAiOiJKV1QiLCJqaWQiOiJwekJxT2V4UGJjSVJTUTFZdDBFbVVINnFQRm5kKzEwYUhUS0xhajd0THpVPSIsImFsZyI6IlJTMjU2Iiwiamt1IjoiaHR0cHM6Ly9pbmMtY3VzdC1wb2MuYXV0aGVudGljYXRpb24uZXUxMC5oYW5hLm9uZGVtYW5kLmNvbS90b2tlbl9rZXlzIiwia2lkIjoiZGVmYXVsdC1qd3Qta2V5LTdmZjdkMDQ3NmEifQ.eyJzdWIiOiJzYi1aVFJFX0JhY2tlbmRfMS1pbmMtY3VzdC1wb2MtSW50ZWdyYXRpb24tQWNjZWxlcmF0b3IhdDM3OTU4MCIsImlzcyI6Imh0dHBzOi8vaW5jLWN1c3QtcG9jLmF1dGhlbnRpY2F0aW9uLmV1MTAuaGFuYS5vbmRlbWFuZC5jb20vb2F1dGgvdG9rZW4iLCJhdXRob3JpdGllcyI6WyJ1YWEucmVzb3VyY2UiXSwiY2xpZW50X2lkIjoic2ItWlRSRV9CYWNrZW5kXzEtaW5jLWN1c3QtcG9jLUludGVncmF0aW9uLUFjY2VsZXJhdG9yIXQzNzk1ODAiLCJhdWQiOlsic2ItWlRSRV9CYWNrZW5kXzEtaW5jLWN1c3QtcG9jLUludGVncmF0aW9uLUFjY2VsZXJhdG9yIXQzNzk1ODAiLCJ1YWEiXSwiZXh0X2F0dHIiOnsiZW5oYW5jZXIiOiJYU1VBQSIsInN1YmFjY291bnRpZCI6IjBjODY0MTY3LWYyMGQtNDgzOC05YzhiLTk4M2VjNDA2MjY2YiIsInpkbiI6ImluYy1jdXN0LXBvYyJ9LCJ6aWQiOiIwYzg2NDE2Ny1mMjBkLTQ4MzgtOWM4Yi05ODNlYzQwNjI2NmIiLCJncmFudF90eXBlIjoiY2xpZW50X2NyZWRlbnRpYWxzIiwiYXpwIjoic2ItWlRSRV9CYWNrZW5kXzEtaW5jLWN1c3QtcG9jLUludGVncmF0aW9uLUFjY2VsZXJhdG9yIXQzNzk1ODAiLCJzY29wZSI6WyJ1YWEucmVzb3VyY2UiXSwiZXhwIjoxNzgxNzE4OTQ2LCJpYXQiOjE3ODE2NzU3NDYsImp0aSI6IjU0NDljZTM3ZTYyYjRiZjA4MjEzM2MyZTUwNGIzOGVkIiwicmV2X3NpZyI6IjliM2NhMWY0IiwiY2lkIjoic2ItWlRSRV9CYWNrZW5kXzEtaW5jLWN1c3QtcG9jLUludGVncmF0aW9uLUFjY2VsZXJhdG9yIXQzNzk1ODAifQ.FPe47wgklA_UE0-uX3z_SzovL1OyPUaMk4EZWSwB7f6aI_YdB4-sPQ4Ctjh-Orw10Hw8O3oznZX2xyNHvwyVAXE0Zojk8zZB9-HBItkFqRygKG87dGeXfWSYdw-1TqQwcJ8O-6MSj_9unpdp6blgDHbij5Z5Z4FaqlRu6IpHGbW3Nas5UPrBiMQAghnSQkYWvEVeXVAdpsv7xUv1kWJmJKeDhWdS5rOulEsdU_pWXGESUYtkkCNpJNDHAjW1afHQ4Vs7KmVEb4c0tVpzeke211vf3AG5Lr0rX0G5NuK56BMyKpyMICe_9ci6rwuzltAFlddy70eazwS2vfaZiM2x-w"
const BASE_URL = "https://inc-cust-poc-integration-accelerator-ztre-backend-1-srv.cfapps.eu10-004.hana.ondemand.com/service/zTR_Backend_1";
const PROGRESS_FILE = path.join(__dirname, "progress.json");

// Message Types & IDoc Types - ALL combinations from dashboard
const messageTypeData = [
    { messageType: "ORDERS", systemAlias: "s4h-210-odata-basic", idocType: "ORDERS05" },
    { messageType: "PORDCR", systemAlias: "s4h-210-odata-basic", idocType: "PORDCR05" },
    { messageType: "ZMT_EMPLOYEE", systemAlias: "s4h-210-odata-basic", idocType: "ZIT_EMPLOYEE" },
    { messageType: "CREFET", systemAlias: "s4h-210-odata-basic", idocType: "ALEREQ01" },
    { messageType: "MATFET", systemAlias: "s4h-210-odata-basic", idocType: "ALEREQ01" },
    { messageType: "DEBFET", systemAlias: "s4h-210-odata-basic", idocType: "ALEREQ01" },
    { messageType: "MATMAS", systemAlias: "s4h-210-odata-basic", idocType: "MATMAS05" },
    { messageType: "MATMAS", systemAlias: "s4h-210-odata-basic", idocType: "MATMAS04" },
    { messageType: "MATMAS", systemAlias: "s4h-210-odata-basic", idocType: "MATMAS07" },
    { messageType: "DEBMAS", systemAlias: "s4h-210-odata-basic", idocType: "DEBMAS08" },
    { messageType: "DEBMAS", systemAlias: "s4h-210-odata-basic", idocType: "DEBMAS04" },
    { messageType: "CREMAS", systemAlias: "s4h-210-odata-basic", idocType: "CREMAS02" },
    { messageType: "CREMAS", systemAlias: "s4h-210-odata-basic", idocType: "CREMAS05" },
    { messageType: "CREMAS", systemAlias: "s4h-210-odata-basic", idocType: "CREMAS07" },
    { messageType: "ORDRSP", systemAlias: "s4h-210-odata-basic", idocType: "ORDERS05" }
];

// Error Status Codes - ALL from dashboard
const errorCodes = [
    { errorCode: "02", description: "IDoc posted with errors" },
    { errorCode: "03", description: "IDoc in creation phase" },
    { errorCode: "21", description: "Despatched" },
    { errorCode: "29", description: "Error in EDI subsystem" },
    { errorCode: "31", description: "Interchange receipt" },
    { errorCode: "33", description: "Interchange receipt not yet sent" },
    { errorCode: "35", description: "EDI outbound processing" },
    { errorCode: "37", description: "IDoc not yet processed" },
    { errorCode: "51", description: "Error in EDI inbound processing" },
    { errorCode: "52", description: "IDoc acknowledged" },
    { errorCode: "56", description: "EDI inbound processing successful" },
    { errorCode: "64", description: "IDoc partially processed" },
    { errorCode: "70", description: "IDoc in archiving" }
];

// Scheduler Config
const schedulerConfig = {
    schedulerName: "TRE Metadata Loader",
    intervalHours: 1,
    active: true
};

/**
 * Load progress from JSON file
 */
function loadProgress() {
    if (fs.existsSync(PROGRESS_FILE)) {
        try {
            const data = fs.readFileSync(PROGRESS_FILE, "utf-8");
            return JSON.parse(data);
        } catch (err) {
            console.warn("[PROGRESS] Failed to load progress file:", err.message);
        }
    }

    return {
        timestamp: new Date().toISOString(),
        messageTypesCreated: [],
        messageTypeIds: {},
        errorCodesCreated: [],
        schedulerConfigCreated: false,
        metadataLoaded: [],
        failed: {
            messageTypes: [],
            errorCodes: [],
            schedulerConfig: null,
            metadata: []
        }
    };
}

/**
 * Save progress to JSON file
 */
function saveProgress(progress) {
    try {
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), "utf-8");
        console.log(`[PROGRESS] Saved to ${PROGRESS_FILE}`);
    } catch (err) {
        console.error("[PROGRESS] Failed to save progress:", err.message);
    }
}

/**
 * Create MessageTypesForMetadata entries
 */
async function createMessageTypes(progress) {
    console.log("\n[CREATE] Seeding MessageTypesForMetadata...");

    for (const msg of messageTypeData) {
        const key = `${msg.messageType}/${msg.systemAlias}/${msg.idocType}`;

        // Skip if already created in progress
        if (progress.messageTypesCreated.includes(key)) {
            console.log(`⊘ Skipped (already created): ${key}`);
            continue;
        }

        try {
            const payload = {
                sapLandscape: "S4HANA",
                systemAlias: msg.systemAlias,
                messageType: msg.messageType,
                idocType: msg.idocType,
                active: true,
                metadataLoaded: false
            };

            const response = await axios.post(`${BASE_URL}/MessageTypesForMetadata`, payload, {
                headers: {
                    Authorization: `Bearer ${BEARER_TOKEN}`,
                    "Content-Type": "application/json"
                }
            });

            // Capture ID from response
            const createdId = response.data.ID || response.data.id;
            progress.messageTypesCreated.push(key);
            progress.messageTypeIds[key] = createdId;
            console.log(`✓ Created: ${key}`);
        } catch (error) {
            const errorMsg = error.response?.data?.message || error.message;

            // Check if it's a duplicate/conflict error
            if (error.response?.status === 409 || errorMsg.toLowerCase().includes('duplicate') || errorMsg.toLowerCase().includes('already')) {
                progress.messageTypesCreated.push(key);
                console.log(`⊘ Already exists: ${key}`);

                // Try to get the ID of the existing entry for later use
                try {
                    const getResponse = await axios.get(`${BASE_URL}/MessageTypesForMetadata`, {
                        headers: {
                            Authorization: `Bearer ${BEARER_TOKEN}`,
                            "Content-Type": "application/json"
                        },
                        params: {
                            $filter: `messageType eq '${msg.messageType}' and systemAlias eq '${msg.systemAlias}' and idocType eq '${msg.idocType}'`,
                            $top: 1
                        }
                    });

                    if (getResponse.data.value && getResponse.data.value.length > 0) {
                        const existingId = getResponse.data.value[0].ID;
                        progress.messageTypeIds[key] = existingId;
                    }
                } catch (getErr) {
                    console.warn(`   [WARN] Could not fetch ID for existing ${key}`);
                }
            } else {
                progress.failed.messageTypes.push({ key, error: errorMsg });
                console.error(`✗ Failed: ${key} → ${errorMsg}`);
            }
        }
    }

    saveProgress(progress);
}

/**
 * Create ErrorCodes entries
 */
async function createErrorCodes(progress) {
    console.log("\n[CREATE] Seeding ErrorCodes...");

    for (const code of errorCodes) {
        const key = `${code.errorCode}`;

        // Skip if already created in progress
        if (progress.errorCodesCreated.includes(key)) {
            console.log(`⊘ Skipped (already created): Error Code ${key}`);
            continue;
        }

        try {
            const payload = {
                errorCode: code.errorCode,
                systemAlias: "s4h-210-odata-basic",
                description: code.description,
                active: true
            };

            const response = await axios.post(`${BASE_URL}/ErrorCodes`, payload, {
                headers: {
                    Authorization: `Bearer ${BEARER_TOKEN}`,
                    "Content-Type": "application/json"
                }
            });

            progress.errorCodesCreated.push(key);
            console.log(`✓ Created: Error Code ${code.errorCode} - ${code.description}`);
        } catch (error) {
            const errorMsg = error.response?.data?.message || error.message;

            // Check if it's a duplicate/conflict error
            if (error.response?.status === 409 || errorMsg.toLowerCase().includes('duplicate') || errorMsg.toLowerCase().includes('already')) {
                progress.errorCodesCreated.push(key);
                console.log(`⊘ Already exists: Error Code ${code.errorCode}`);
            } else {
                progress.failed.errorCodes.push({ key, error: errorMsg });
                console.error(`✗ Failed: Error Code ${code.errorCode} → ${errorMsg}`);
            }
        }
    }

    saveProgress(progress);
}

/**
 * Create SchedulerConfig entry
 */
async function createSchedulerConfig(progress) {
    console.log("\n[CREATE] Seeding SchedulerConfig...");

    // Skip if already created in progress
    if (progress.schedulerConfigCreated) {
        console.log(`⊘ Skipped (already created): SchedulerConfig`);
        return;
    }

    try {
        const payload = {
            schedulerName: schedulerConfig.schedulerName,
            systemAlias: "s4h-210-odata-basic",
            intervalHours: schedulerConfig.intervalHours,
            active: schedulerConfig.active
        };

        const response = await axios.post(`${BASE_URL}/SchedulerConfig`, payload, {
            headers: {
                Authorization: `Bearer ${BEARER_TOKEN}`,
                "Content-Type": "application/json"
            }
        });

        progress.schedulerConfigCreated = true;
        console.log(`✓ Created: SchedulerConfig - Interval ${schedulerConfig.intervalHours} hour(s)`);
    } catch (error) {
        const errorMsg = error.response?.data?.message || error.message;

        // Check if it's a duplicate/conflict error
        if (error.response?.status === 409 || errorMsg.toLowerCase().includes('duplicate') || errorMsg.toLowerCase().includes('already')) {
            progress.schedulerConfigCreated = true;
            console.log(`⊘ Already exists: SchedulerConfig`);
        } else {
            progress.failed.schedulerConfig = errorMsg;
            console.error(`✗ Failed: SchedulerConfig → ${errorMsg}`);
        }
    }

    saveProgress(progress);
}

/**
 * Load metadata for all active message types
 */
async function loadAllMetadata(progress) {
    console.log("\n[LOAD] Starting metadata load for all message types...");

    for (const msg of messageTypeData) {
        const key = `${msg.messageType}/${msg.systemAlias}`;

        // Skip if already loaded
        if (progress.metadataLoaded.includes(key)) {
            console.log(`⊘ Skipped (already loaded): ${key}`);
            continue;
        }

        try {
            // Get the ID from progress (stored during creation)
            const id = progress.messageTypeIds[`${msg.messageType}/${msg.systemAlias}/${msg.idocType}`];

            if (!id) {
                console.warn(`⚠ No ID found for ${key} - skipping metadata load`);
                continue;
            }

            // Call loadMetadata action with the stored ID
            const loadUrl = `${BASE_URL}/MessageTypesForMetadata(ID=${id},IsActiveEntity=true)/tRE_Admin.loadMetadata`;

            const response = await axios.post(loadUrl, {}, {
                headers: {
                    Authorization: `Bearer ${BEARER_TOKEN}`,
                    "Content-Type": "application/json"
                }
            });

            progress.metadataLoaded.push(key);
            console.log(`✓ Loaded: ${key} → status=${response.data.status}, idocTypes=${response.data.idocTypes}, segments=${response.data.segments}, fields=${response.data.fields}`);
        } catch (error) {
            const errorMsg = error.response?.data?.message || error.response?.data?.error?.message || error.message;
            progress.failed.metadata.push({ key, error: errorMsg });
            console.error(`✗ Failed to load: ${key} → ${errorMsg}`);
        }
    }

    saveProgress(progress);
}

/**
 * Print summary report
 */
function printSummary(progress) {
    console.log("\n╔════════════════════════════════════════╗");
    console.log("║           EXECUTION SUMMARY            ║");
    console.log("╚════════════════════════════════════════╝");

    console.log(`\n✓ Message Types Created: ${progress.messageTypesCreated.length}/${messageTypeData.length}`);
    console.log(`✓ Error Codes Created: ${progress.errorCodesCreated.length}/${errorCodes.length}`);
    console.log(`✓ Scheduler Config: ${progress.schedulerConfigCreated ? "Created" : "Not created"}`);
    console.log(`✓ Metadata Loaded: ${progress.metadataLoaded.length}/${messageTypeData.length}`);

    if (progress.failed.messageTypes.length > 0) {
        console.log(`\n✗ Failed Message Types (${progress.failed.messageTypes.length}):`);
        progress.failed.messageTypes.forEach(f => console.log(`   - ${f.key}: ${f.error}`));
    }

    if (progress.failed.errorCodes.length > 0) {
        console.log(`\n✗ Failed Error Codes (${progress.failed.errorCodes.length}):`);
        progress.failed.errorCodes.forEach(f => console.log(`   - ${f.key}: ${f.error}`));
    }

    if (progress.failed.schedulerConfig) {
        console.log(`\n✗ Failed SchedulerConfig: ${progress.failed.schedulerConfig}`);
    }

    if (progress.failed.metadata.length > 0) {
        console.log(`\n✗ Failed Metadata Loads (${progress.failed.metadata.length}):`);
        progress.failed.metadata.forEach(f => console.log(`   - ${f.key}: ${f.error}`));
    }

    console.log(`\n[INFO] Progress saved to: ${PROGRESS_FILE}`);
}

/**
 * Initialize seed data and start scheduler
 */
async function initialize() {
    console.log("╔════════════════════════════════════════╗");
    console.log("║  TRE Metadata Loader - Initialization  ║");
    console.log("╚════════════════════════════════════════╝");

    // Load existing progress
    const progress = loadProgress();
    console.log(`[PROGRESS] Loaded from ${PROGRESS_FILE}`);

    // Create seed data
    // await createMessageTypes(progress);
    await createErrorCodes(progress);
    // await createSchedulerConfig(progress);

    // Load metadata
    // await loadAllMetadata(progress);

    // Print summary
    printSummary(progress);

    // Schedule recurring metadata load every 1 hour
    console.log("\n[SCHEDULER] Starting cron job - Every 1 hour");
    cron.schedule("0 * * * *", async () => {
        console.log("\n[SCHEDULER] Cron triggered - Running metadata load...");
        const currentProgress = loadProgress();
        await loadAllMetadata(currentProgress);
    });

    console.log("\n✓ Initialization complete. Scheduler running every 1 hour.");
}

// Run initialization
initialize().catch(err => {
    console.error("Initialization failed:", err.message);
    process.exit(1);
});
