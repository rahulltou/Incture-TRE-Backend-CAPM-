/**
 * DMS/CMS Connector Service
 * Handles upload, retrieval, and management of backup files in DMS/CMS
 */

const axios = require('axios');
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');

const LOG = require('@sap/cds').log('dms-connector');

/**
 * DMS Connector Configuration
 * Adjust based on your DMS/CMS system
 */
const DMS_CONFIG = {
    DESTINATION_NAME: process.env.DMS_DESTINATION_NAME || 'DMS_CONNECTOR',
    FOLDER_PATH: process.env.DMS_FOLDER_PATH || '/TRE_BACKUPS',
    TIMEOUT: parseInt(process.env.DMS_TIMEOUT || '30000', 10),
    RETRY_ATTEMPTS: parseInt(process.env.DMS_RETRY_ATTEMPTS || '3', 10),
};

/**
 * Upload backup file to DMS/CMS
 * @param {Buffer} fileBuffer - Excel file buffer
 * @param {String} fileName - File name with extension
 * @param {String} metadata - Optional metadata object
 * @returns {Promise<{refId, url, timestamp}>}
 */
async function uploadBackupToDMS(fileBuffer, fileName, metadata = {}) {
    let attempt = 0;

    while (attempt < DMS_CONFIG.RETRY_ATTEMPTS) {
        try {
            LOG.info(`[uploadBackupToDMS] Attempt ${attempt + 1}/${DMS_CONFIG.RETRY_ATTEMPTS} - Uploading ${fileName}...`);

            /* Option 1: Using SAP Cloud SDK executeHttpRequest (for BTP destinations) */
            const response = await executeHttpRequest(
                { destinationName: DMS_CONFIG.DESTINATION_NAME },
                {
                    method: 'POST',
                    url: `/api/documents/upload`,
                    data: {
                        fileName: fileName,
                        folderPath: DMS_CONFIG.FOLDER_PATH,
                        fileContent: fileBuffer.toString('base64'),
                        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        metadata: {
                            doctype: 'IDOC_BACKUP',
                            ...metadata
                        }
                    },
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    timeout: DMS_CONFIG.TIMEOUT,
                }
            );

            const result = {
                refId: response.data?.id || response.data?.documentId || `DMS_${Date.now()}`,
                url: response.data?.url || `${DMS_CONFIG.FOLDER_PATH}/${fileName}`,
                timestamp: new Date().toISOString(),
                status: 'SUCCESS'
            };

            LOG.info(`[uploadBackupToDMS] Successfully uploaded ${fileName} with refId: ${result.refId}`);
            return result;

        } catch (error) {
            attempt++;
            LOG.warn(`[uploadBackupToDMS] Attempt ${attempt} failed: ${error.message}`);

            if (attempt >= DMS_CONFIG.RETRY_ATTEMPTS) {
                LOG.error(`[uploadBackupToDMS] All retry attempts exhausted for ${fileName}`);
                throw new Error(`DMS Upload failed after ${DMS_CONFIG.RETRY_ATTEMPTS} attempts: ${error.message}`);
            }

            /* Exponential backoff */
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
    }
}

/**
 * Retrieve backup from DMS/CMS by reference ID
 * @param {String} dmsRefId - DMS reference ID
 * @returns {Promise<Buffer>} File buffer
 */
async function retrieveBackupFromDMS(dmsRefId) {
    try {
        LOG.info(`[retrieveBackupFromDMS] Retrieving backup with refId: ${dmsRefId}`);

        const response = await executeHttpRequest(
            { destinationName: DMS_CONFIG.DESTINATION_NAME },
            {
                method: 'GET',
                url: `/api/documents/${dmsRefId}/download`,
                responseType: 'arraybuffer',
                timeout: DMS_CONFIG.TIMEOUT,
            }
        );

        LOG.info(`[retrieveBackupFromDMS] Successfully retrieved backup ${dmsRefId}`);
        return Buffer.from(response.data);

    } catch (error) {
        LOG.error(`[retrieveBackupFromDMS] Failed to retrieve backup ${dmsRefId}: ${error.message}`);
        throw new Error(`DMS Retrieval failed: ${error.message}`);
    }
}

/**
 * Delete backup from DMS/CMS
 * @param {String} dmsRefId - DMS reference ID
 * @returns {Promise<{status}>}
 */
async function deleteBackupFromDMS(dmsRefId) {
    try {
        LOG.info(`[deleteBackupFromDMS] Deleting backup with refId: ${dmsRefId}`);

        await executeHttpRequest(
            { destinationName: DMS_CONFIG.DESTINATION_NAME },
            {
                method: 'DELETE',
                url: `/api/documents/${dmsRefId}`,
                timeout: DMS_CONFIG.TIMEOUT,
            }
        );

        LOG.info(`[deleteBackupFromDMS] Successfully deleted backup ${dmsRefId}`);
        return { status: 'DELETED' };

    } catch (error) {
        LOG.error(`[deleteBackupFromDMS] Failed to delete backup ${dmsRefId}: ${error.message}`);
        throw new Error(`DMS Deletion failed: ${error.message}`);
    }
}

/**
 * List backups in DMS/CMS folder
 * @param {Object} filters - Optional filters (docnum, dateFrom, dateTo)
 * @returns {Promise<Array>} List of backup metadata
 */
async function listBackupsInDMS(filters = {}) {
    try {
        LOG.info(`[listBackupsInDMS] Listing backups with filters:`, filters);

        const response = await executeHttpRequest(
            { destinationName: DMS_CONFIG.DESTINATION_NAME },
            {
                method: 'GET',
                url: `/api/documents/list`,
                params: {
                    folderPath: DMS_CONFIG.FOLDER_PATH,
                    doctype: 'IDOC_BACKUP',
                    ...filters
                },
                timeout: DMS_CONFIG.TIMEOUT,
            }
        );

        const backups = response.data?.documents || [];
        LOG.info(`[listBackupsInDMS] Found ${backups.length} backups`);

        return backups;

    } catch (error) {
        LOG.error(`[listBackupsInDMS] Failed to list backups: ${error.message}`);
        throw new Error(`DMS List failed: ${error.message}`);
    }
}

/**
 * Get DMS connector status/health check
 * @returns {Promise<{status, message}>}
 */
async function checkDMSConnectivity() {
    try {
        LOG.info(`[checkDMSConnectivity] Checking DMS connectivity...`);

        const response = await executeHttpRequest(
            { destinationName: DMS_CONFIG.DESTINATION_NAME },
            {
                method: 'GET',
                url: `/api/health`,
                timeout: 5000,
            }
        );

        LOG.info(`[checkDMSConnectivity] DMS is healthy`);
        return {
            status: 'CONNECTED',
            message: 'DMS/CMS system is accessible',
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        LOG.error(`[checkDMSConnectivity] DMS connectivity check failed: ${error.message}`);
        return {
            status: 'DISCONNECTED',
            message: `DMS connectivity error: ${error.message}`,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Fallback: Store backup locally if DMS is unavailable
 * @param {Buffer} fileBuffer - Excel file buffer
 * @param {String} fileName - File name
 * @returns {Promise<{refId, path, timestamp}>}
 */
async function storeBackupLocally(fileBuffer, fileName) {
    try {
        const fs = require('fs').promises;
        const path = require('path');

        const backupDir = path.join(process.cwd(), 'backups');

        // Create backups directory if not exists
        try {
            await fs.mkdir(backupDir, { recursive: true });
        } catch (e) {
            // Directory might already exist
        }

        const filePath = path.join(backupDir, fileName);
        await fs.writeFile(filePath, fileBuffer);

        LOG.info(`[storeBackupLocally] Backup stored locally at: ${filePath}`);

        return {
            refId: `LOCAL_${Date.now()}_${fileName}`,
            path: filePath,
            timestamp: new Date().toISOString(),
            status: 'STORED_LOCALLY'
        };

    } catch (error) {
        LOG.error(`[storeBackupLocally] Failed to store backup locally: ${error.message}`);
        throw new Error(`Local backup storage failed: ${error.message}`);
    }
}

module.exports = {
    uploadBackupToDMS,
    retrieveBackupFromDMS,
    deleteBackupFromDMS,
    listBackupsInDMS,
    checkDMSConnectivity,
    storeBackupLocally,
    DMS_CONFIG
};
