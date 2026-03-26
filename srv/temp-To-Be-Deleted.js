const cds = require("@sap/cds");
const { SELECT, UPDATE, INSERT, DELETE } = cds.ql;
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');
const { getDestination } = require("@sap-cloud-sdk/connectivity");


module.exports = (srv) => {
  const repositoryId = process.env.SDM_REPOSITORY_ID;
  const objectId = process.env.SDM_OBJECT_ID;
  const JOB_CODE = process.env.JOB_CODE;
  const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE || 10);
  const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
  let thresHold = Number(process.env.APPROVAL_TRESHOLD_VALUE || 0);
  // const thresHold = process.env.APPROVAL_TRESHOLD_VALUE
  const timeOut = Number(process.env.LOCK_TIMEOUT || 2);
  const LOCK_TIMEOUT_MS = timeOut * 60 * 1000; // Minutes
  const HEARTBEAT_INTERVAL = Number(process.env.HEARTBEAT_INTERVAL || 0); // seconds
  const { lotteryBalancing, lotteryAttachments, editLocks, lotterySummary } = srv.entities;
  /**
   * Submit Week - Validate and submit entire week
   */
  srv.on('READ', 'employeeClub', async req => {
    const WORKDAY_EMP_MASTERDATA = await cds.connect.to("WORKDAY_EMP_MASTERDATA");
    const sUserID = req.user.id;
    if (!sUserID) {
      return req.reject(401, "User not authenticated");
    }
    req.query.where({
      Email: sUserID
    });
    return WORKDAY_EMP_MASTERDATA.run(req.query);
  });
  srv.on("READ", "UserInfo", (req) => {
    return [{
      ID: req.user.id,
      isClubUser: req.user.is("B_APP_CI_LOTTERY_BALANCING_CLUB_USER"),
      isManager: req.user.is("B_APP_CI_LOTTERY_BALANCING_MANAGER"),
      isSalesAudit: req.user.is("B_APP_CI_LOTTERY_BALANCING_SALES_AUDIT"),
      heartBeatInterval: HEARTBEAT_INTERVAL
    }];
  });
  srv.on("submitWeek", async (req) => {
    const { storeId, weekEnding } = req.data;
    console.log("=== SUBMIT WEEK ===");
    console.log("Store ID:", storeId);
    console.log("Week Ending:", weekEnding);
    let statusUpdate = "";
    let recordCount;
    let validationErrorsGet = [];
    let tx;
    try {
      const dates = getWeekDates(weekEnding);
      for (const date of dates) {
        await _assertUserHoldsLock(storeId, date, req);
      }
      tx = cds.tx(req);
      const numericFields = [
        'onlineSales',
        'instantSalesPOS',
        'onlineSalesMachine',
        'onlineRedeemDesk',
        'instantRedeemDesk',
        'reinvestMachine',
        'sapRedemption',
        'sapSales'
      ];
      const lockedStatuses = ['APPROVALPENDING', 'APPROVED', 'POSTED'];
      // do not allow for submitting future week.
      const today = new Date();
      // today.toString();
      today.setHours(0, 0, 0, 0);

      const inputWeekEnding = new Date(weekEnding);
      inputWeekEnding.setHours(0, 0, 0, 0);

      if (inputWeekEnding > today) {
        return {
          success: false,
          message: "Future week ending cannot be submitted.",
          validationErrors: []
        };
      }
      // Get all records for the week
      const records = await tx.run(SELECT.from(lotteryBalancing)
        .where({ storeId, weekEnding })
        .orderBy({ businessDate: 'asc' }));
      if (records.length === 0) {
        return {
          success: false,
          message: "No records found for this week",
          validationErrors: []
        };
      }
      const datesToCheck = getWeekDates(weekEnding);
      const attachments = await tx.run(SELECT.from(lotteryAttachments)
        .where({ storeId, businessDate: { in: datesToCheck } }));

      console.log(`Found ${records.length} records for the week`);
      // Validation
      const validationErrors = [];
      let totVariance = 0;
      const attachmentMap = new Map();
      attachments.forEach(a => attachmentMap.set(a.businessDate, true));

      for (const record of records) {

        const dayName = getDayName(record.businessDate, weekEnding);

        totVariance += Number(record.totalVariance || 0);

        if (lockedStatuses.includes(record.status)) {
          validationErrors.push({
            day: dayName,
            message: `${dayName} is already ${record.status}`
          });
          continue;
        }

        const hasData = numericFields.some(f => {
          const v = record[f];
          return v !== null && v !== undefined && (v !== 0 && v !== '0.00');
        });

        if (hasData && !attachmentMap.has(record.businessDate)) {
          validationErrors.push({
            day: dayName,
            message: `${dayName} has no attachments`
          });
        }
      }
      totVariance = round2(totVariance);

      // If validation errors (excluding warnings)
      const blockingErrors = validationErrors.filter(e => !e.warning);
      if (blockingErrors.length > 0) {
        return {
          success: false,
          message: "Validation failed. Please fix the errors before submitting.",
          validationErrors: validationErrors
        };
      }

      let statusSet = ''
      // Check for variance exceeding threshold (example: > $100)
      if (Math.abs(totVariance) > Math.abs(thresHold)) {
        statusSet = 'APPROVALPENDING';
        // statusSet = 'APPROVALPENDING';
      } else {
        // statusSet = 'APPROVED';
        statusSet = 'APPROVED';
      }
      // Build app URL
      const appUrl = `${process.env.APP_HOST}`
        + `?club=${encodeURIComponent(storeId)}`
        + `&weekEnding=${encodeURIComponent(weekEnding)}`
        + `${process.env.APP_HOST_END}`;
      console.log('Amout Url: ', appUrl);
      // Update all records to SUBMITTED
      await tx.run(
        UPDATE(lotteryBalancing)
          .set({
            status: statusSet,
            // isLocked: true,
            modifiedBy: req.user?.id || 'system',
            modifiedAt: new Date().toISOString()
          })
          .where({ storeId, weekEnding }));
      await tx.commit();
      console.log("Week submitted successfully");
      statusUpdate = 'X';
      recordCount = records.length;
      validationErrorsGet = validationErrors.filter(e => e.warning);
      // Send notification email
      const bpaResponse = await triggerBPAProcess({
        storeId,
        weekEnding,
        totalVariance: totVariance,
        appUrl
      }, req);
      return {
        success: true,
        message: `Week ending ${weekEnding} submitted successfully, Manager has been notified.`,
        recordCount: records.length,
        validationErrors: validationErrors.filter(e => e.warning) // Return warnings only
      };
    } catch (error) {
      console.error("Submit error:", error);
      if (tx) await tx.rollback();
      let success;
      let message;
      if (!statusUpdate) {
        success = false;
        message = `Submit failed:  ${error.message}`;
      } else {
        success = false;
        message = `Week ending ${weekEnding} submitted successfully, Manager notification failed :  ${error.message}`;
      }
      return {
        // success: false,
        // message: "Submit failed: " + error.message,
        // validationErrors: []
        success,
        message,
        recordCount,
        validationErrors: validationErrorsGet
      };
    }
  });
  function getDayName(businessDate, weekEnding) {
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const date = new Date(businessDate);
    return daysOfWeek[date.getDay()];
  };
  /**
  * Approve Week - Add comments and approve
  */
  srv.on("approveWeekCheck", async (req) => {
    const { storeId, weekEnding } = req.data;
    if (!req.user.is("B_APP_CI_LOTTERY_BALANCING_MANAGER")) {
      return req.reject(403, "you are Not authorized to Approve");
    }
    let tx;
    try {
      // Get all records for the week
      tx = cds.tx(req);
      const totalRecords = await tx.run(
        SELECT.one.from(lotteryBalancing)
          .columns('count(*) as count')
          .where({ storeId, weekEnding })
      );
      if (!totalRecords || totalRecords.count === 0) {
        return {
          success: false,
          message: "No records found for this week"
        };
      }
      const records = await tx.run(SELECT.one.from(lotteryBalancing).columns('count(*) as count')
        .where({ storeId, weekEnding, status: { '!=': 'APPROVALPENDING' } }));
      if (records.count > 0) {
        return {
          success: false,
          message: "All records must be in APPROVALPENDING status to approve"
        };
      }
      await tx.commit();
      return {
        success: true,
        message: ""
      };
    } catch (error) {
      console.error("Approve error:", error);
      if (tx) await tx.rollback();
      return {
        success: false,
        message: "Approval failed: " + error.message
      };
    }
  });
  srv.on("approveWeek", async (req) => {
    const { storeId, weekEnding, comments } = req.data;
    console.log("=== APPROVE WEEK ===");
    console.log("Store ID:", storeId);
    console.log("Week Ending:", weekEnding);
    console.log("Comments:", comments);
    if (!req.user.is("B_APP_CI_LOTTERY_BALANCING_MANAGER")) {
      return req.reject(403, "you are Not authorized to Approve");
    }
    let tx;
    try {
      const dates = getWeekDates(weekEnding);
      for (const date of dates) {
        await _assertUserHoldsLock(storeId, date, req);
      }
      // Get all records for the week
      tx = cds.tx(req);
      const totalRecords = await tx.run(
        SELECT.one.from(lotteryBalancing)
          .columns('count(*) as count')
          .where({ storeId, weekEnding })
      );

      if (!totalRecords || totalRecords.count === 0) {
        return {
          success: false,
          message: "No records found for this week"
        };
      }
      const records = await tx.run(SELECT.one.from(lotteryBalancing).columns('count(*) as count')
        // .where({ storeId, weekEnding });
        .where({ storeId, weekEnding, status: { '!=': 'APPROVALPENDING' } }));
      if (records.count > 0) {
        return {
          success: false,
          message: "All records must be in APPROVALPENDING status to approve"
        };
      }
      // Check if week is submitted
      // const notSubmitted = records.filter(r => r.status !== 'APPROVALPENDING');
      // if (notSubmitted.length > 0) {
      //   return {
      //     success: false,
      //     message: "Can be Approved with status 'APPROVALPENDING'"
      //   };
      // }
      // Update all records to APPROVED
      await tx.run(UPDATE(lotteryBalancing)
        .set({
          status: 'APPROVED',
          // isLocked: true,
          modifiedBy: req.user?.id || 'system',
          modifiedAt: new Date().toISOString()
        })
        .where({ storeId, weekEnding }));
      // Add comment if provided
      if (comments && comments.trim() !== '') {
        const summaryRecord = await tx.run(SELECT.one.from(lotterySummary).where({ storeId, weekEnding }));
        if (!summaryRecord) {
          await tx.run(INSERT.into(lotterySummary).entries({
            storeId,
            weekEnding,
            approvalComments: comments
          }));
        } else {
          await tx.run(UPDATE(lotterySummary).set({ approvalComments: comments }).where({ storeId, weekEnding }));
        }
      }
      await tx.commit();
      console.log("Week approved successfully");
      return {
        success: true,
        message: `Week ending ${weekEnding} approved successfully.`
      };
    } catch (error) {
      console.error("Approve error:", error);
      if (tx) await tx.rollback();
      return {
        success: false,
        message: "Approval failed: " + error.message
      };
    }
  });
  /**
  * Reject Week - Set back to INPROGRESS
  */
  srv.on("rejectWeek", async (req) => {
    const { storeId, weekEnding } = req.data;
    console.log("=== REJECT WEEK ===");
    console.log("Store ID:", storeId);
    console.log("Week Ending:", weekEnding);
    if (!req.user.is("B_APP_CI_LOTTERY_BALANCING_MANAGER")) {
      return req.reject(403, "you are Not authorized to reject");
    }
    let tx;
    // console.log("Reason:", reason);
    try {
      const dates = getWeekDates(weekEnding);
      for (const date of dates) {
        await _assertUserHoldsLock(storeId, date, req);
      }
      // Get all records for the week
      tx = cds.tx(req);
      const records = await tx.run(SELECT.from(lotteryBalancing)
        .where({ storeId, weekEnding }));
      if (records.length === 0) {
        return {
          success: false,
          message: "No records found for this week"
        };
      }
      // Check if week is submitted
      const notSubmitted = records.filter(r => r.status !== 'APPROVALPENDING');
      if (notSubmitted.length > 0) {
        return {
          success: false,
          message: "Can be Rejected with status 'APPROVALPENDING'"
        };
      }
      // Update all records to INPROGRESS and unlock
      await tx.run(UPDATE(lotteryBalancing)
        .set({
          status: 'INPROGRESS',
          // isLocked: false, // Unlock for editing
          modifiedBy: req.user?.id || 'system',
          modifiedAt: new Date().toISOString()
        })
        .where({ storeId, weekEnding }));
      console.log("Week rejected successfully");
      await tx.commit();
      // Send notification email
      // try {
      //   await sendRejectionNotification(storeId, weekEnding, records, req);
      // } catch (emailError) {
      //   console.error("Email notification failed:", emailError);
      // }
      return {
        success: true,
        message: `Week ending ${weekEnding} has been rejected and unlocked for corrections.`,
        recordCount: records.length
        // reason: reason
      };
    } catch (error) {
      console.error("Reject error:", error);
      if (tx) await tx.rollback();
      return {
        success: false,
        message: "Rejection failed: " + error.message
      };
    }
  });
  /* ===========================================================
     1. DMS Functionality
     =========================================================== */

  /**
   * Upload attachment to DMS
   */
  srv.on("uploadAttachmentToDMS", async (req) => {

    const { storeId, businessDate, fileName, mimeType, content } = req.data;
    // await _assertUserHoldsLock(storeId, businessDate, req);
    if (!content) {
      return req.reject(400, "No file content provided");
    }
    let tx;
    let dmsResult;
    try {
      // Validate parent record
      tx = cds.tx(req);
      const parent = await tx.run(SELECT.one.from(lotteryBalancing)
        .where({ storeId, businessDate }));
      if (!parent) {
        return req.reject(404, "Parent lottery balancing record not found");
      }
      // ->Add Pessimistic lock //
      // await _ensureLockOwnerOrFail(req, storeId, parent.weekEnding);
      // Add Pessimistic lock <- //
      // if (parent.isLocked) {
      //   if (tx) await tx.rollback();
      //   return req.reject(403, "Cannot upload to locked record");
      // }
      // Convert base64 to buffer
      const buffer = Buffer.from(content, 'base64');
      if (buffer.length > MAX_FILE_SIZE) {
        // return req.reject(413, `File too large and allowed size under ${MAX_FILE_SIZE_MB}MB`);
        return req.reject(
          413,
          `File too large. Maximum allowed size is ${MAX_FILE_SIZE_MB} MB`
        );
      }

      // Upload to DMS
      dmsResult = await uploadToDMS(fileName, mimeType, buffer, req);
      // Create attachment record
      const attachmentId = cds.utils.uuid();
      await tx.run(INSERT.into(lotteryAttachments).entries({
        attachmentId: attachmentId,
        storeId: storeId,
        businessDate: businessDate,
        filename: fileName,
        mimeType: mimeType,
        fileSize: buffer.length,

        // DMS fields
        dmsRepositoryId: dmsResult.repositoryId,
        dmsObjectId: dmsResult.objectId,
        dmsDocumentId: dmsResult.documentId,
        dmsUrl: dmsResult.Url,

        // Metadata
        // uploadedBy: req.user?.id || 'system',
        uploadAt: new Date().toISOString(),
        uploadBy: dmsResult.uploadedBy,
        // uploadAt: dmsResult.uploadedAt
      }));
      await tx.commit();
      return {
        success: true,
        attachmentId: attachmentId,
        dmsObjectId: dmsResult.objectId,
        dmsUrl: dmsResult.Url,
        message: "File uploaded to DMS successfully"
      };
    } catch (error) {
      // COMPENSATING ACTION
      if (dmsResult?.repositoryId && dmsResult?.objectId) {
        try {
          await deleteFromDMS(
            dmsResult.repositoryId,
            dmsResult.objectId,
            req
          );
        } catch (cleanupError) {
          console.error("DMS cleanup failed:", cleanupError.message);
        }
      }
      if (tx) await tx.rollback();
      return {
        success: false,
        attachmentId: null,
        dmsObjectId: null,
        dmsUrl: null,
        message: "Upload failed: " + error.message
      };
    }
  });
  /**
  * Download attachment from DMS
  */
  srv.on("downloadAttachmentFromDMS", async (req) => {
    const { attachmentId } = req.data;
    try {
      const attachment = await SELECT.one.from(lotteryAttachments)
        .where({ attachmentId });
      if (!attachment) {
        return req.reject(404, "Attachment not found");
      }
      // Download from DMS
      const content = await downloadFromDMS(
        attachment.dmsRepositoryId,
        attachment.dmsObjectId,
        req
      );
      return {
        success: true,
        content: content.toString('base64'),
        fileName: attachment.filename,
        mimeType: attachment.mimeType,
        message: "File downloaded successfully"
      };
    } catch (error) {
      console.error("DMS download error:", error);
      return {
        success: false,
        content: null,
        fileName: null,
        mimeType: null,
        message: "Download failed: " + error.message
      };
    }
  });
  /**
  * Delete attachment from DMS
  */
  srv.on("deleteAttachmentFromDMS", async (req) => {
    const { attachmentId } = req.data;
    try {
      const attachment = await SELECT.one.from(lotteryAttachments)
        .where({ attachmentId });
      if (!attachment) {
        return req.reject(404, "Attachment not found");
      } else {
        await _assertUserHoldsLock(attachment.storeId, attachment.businessDate, req);
      }
      const parent = await SELECT.one.from(lotteryBalancing)
        .where({
          storeId: attachment.storeId,
          businessDate: attachment.businessDate
        });
      if (!parent) return req.reject(404, 'Parent lottery balancing record not found');
      console.log("Deleting attachment from DMS:", attachmentId);
      await deleteFromDMS(
        attachment.dmsRepositoryId,
        attachment.dmsObjectId,
        req
      );
      // Delete database record
      await DELETE.from(lotteryAttachments)
        .where({ attachmentId });
      return {
        success: true,
        message: "Attachment deleted successfully"
      };
    } catch (error) {
      console.error("DMS delete error:", error);
      return {
        success: false,
        message: "Delete failed: " + error.message
      };
    }
  });
  /* ========================================
  DMS Helper Functions
  ======================================== */
  /**
  * Upload file to DMS
  */
  async function uploadToDMS(fileName, mimeType, buffer, req) {

    // console.log("REPO:", process.env.SDM_REPOSITORY_ID);
    // const buffer = Buffer.from(contentBase64, 'base64');

    // const formData = new FormData();
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('cmisaction', 'createDocument');
    formData.append('objectId', objectId);
    formData.append('propertyId[0]', 'cmis:objectTypeId');
    formData.append('propertyValue[0]', 'cmis:document');
    formData.append('propertyId[1]', 'cmis:name');
    formData.append('propertyValue[1]', fileName);
    formData.append('content', buffer, {
      filename: fileName,
      contentType: mimeType
    });
    try {
      const token = req.headers?.authorization?.replace('Bearer ', '');
      if (!token) return req.reject(401, 'Missing JWT token');
      // const destination = await getDestination({ destinationName: 'DMS_APPS_DEV', jwt: req.headers.authorization?.split(' ')[1] });
      const destination = await getDestination({ destinationName: 'DMS_APPS_DEV', jwt: token });
      console.log('Url:', destination.url);
      const response = await executeHttpRequest(
        { destinationName: 'DMS_APPS_DEV', jwt: token },
        {
          method: 'POST',
          url: `${repositoryId}/root`,
          headers: {
            ...formData.getHeaders()
          },
          data: formData
        }
      );
      console.log('response:', response);
      return {
        repositoryId,
        objectId: response.data.properties['cmis:objectId'].value,
        // versionSeriesId,
        // Url: `${ destination.url } / ${ repositoryId } / root ? objectId = ${ objectId }`,
        // Url: `${ destination.url } / ${ repositoryId } ? cmisselector = content & objectId=${ objectId }`,
        Url: `${destination.url}/${repositoryId}?cmisselector=content&objectId=${response.data.properties['cmis:objectId'].value}`,
        fileName: response.data.properties['cmis:name'].value,
        uploadedAt: response.data.properties['cmis:creationDate'].value,
        uploadedBy: response.data.properties['cmis:createdBy'].value
      };

    } catch (err) {
      console.error('DMS upload failed:', err.response?.data || err.message);
      // console.error('DMS upload failed:', err.response?.data?.message );
      // err.message = err.response?.data?.message;
      err.message = err.response?.data?.message || err.message;
      throw err;
    }
  }
  /**
  * Download file from DMS
  */
  async function downloadFromDMS(repositoryId, objectId, req) {
    if (!repositoryId || !objectId) {
      throw new Error("Repository ID and Object ID are required for deletion.");
    }
    try {
      const token = req.headers?.authorization?.replace('Bearer ', '');
      if (!token) return req.reject(401, 'Missing JWT token');
      const response = await executeHttpRequest(
        // { destinationName: 'DMS_APPS_DEV', jwt: req.headers.authorization?.split(' ')[1] },
        { destinationName: 'DMS_APPS_DEV', jwt: token },
        {
          method: 'GET',
          url: `${repositoryId}/root`,
          params: {
            cmisselector: "content",
            objectId
          },
          responseType: "arraybuffer"
        }
      );
      return Buffer.from(response.data);
    } catch (error) {
      console.error("DMS download error:", error.response?.data || error.message);
      throw new Error("Failed to download from DMS: " + error.message);
    }
  }
  /**
  * Delete file from DMS
  */
  async function deleteFromDMS(repositoryId, objectId, req) {
    if (!repositoryId || !objectId) {
      throw new Error("Repository ID and Object ID are required for deletion.");
    }
    try {
      const token = req.headers?.authorization?.replace('Bearer ', '');
      if (!token) return req.reject(401, 'Missing JWT token');
      const FormData = require('form-data');
      const formData = new FormData();
      formData.append("cmisaction", "delete");
      formData.append("objectId", objectId);
      await executeHttpRequest(
        {
          destinationName: "DMS_APPS_DEV",
          // jwt: req?.headers?.authorization?.split(" ")[1],
          jwt: token,
          csrf: false
        },
        {
          method: "POST",
          url: `${repositoryId}/root`,
          headers: {
            ...formData.getHeaders()
          },
          data: formData
        }
      );
    } catch (error) {
      console.error("DMS delete error:", error.response?.data || error.message);
      throw new Error("Failed to delete from DMS: " + error.message);
    }
  }

  srv.before("CREATE", lotteryAttachments, async (req) => {
    console.log('Attachment Data', req.data);
    const parent = await SELECT.one.from(lotteryBalancing).where({ storeId: req.data.storeId, businessDate: req.data.businessDate });
    if (!parent) {
      return req.reject(403, 'Cannot add attachments to the record');
    }
  });

  /* ===========================================================
     1. Block DELETE Completely
     =========================================================== */
  srv.on("DELETE", lotteryBalancing, (req) => {
    return req.reject(403, "Delete is not allowed for Lottery Balancing");
  });
  srv.on("updateWeek", async (req) => {
    const { storeId, weekEnding, entries } = req.data;
    console.log('Data for update', req.data);
    // await assertUserHoldsLock(storeId, weekEnding, req);
    const tx = cds.tx(req);

    try {
      for (const entry of entries) {
        const values = JSON.parse(entry.values);
        await tx.run(
          UPDATE(lotteryBalancing)
            .set(values)
            .where({
              storeId,
              businessDate: entry.businessDate
            })
        );
      }

      await tx.commit();
      return { success: true, message: "Week updated successfully" };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  srv.on('updateDaily', async req => {

    // ->Add Pessimistic lock //
    const { storeId, businessDate, values } = req.data;
    await _assertUserHoldsLock(storeId, businessDate, req);

    //  const { storeId, businessDate, values } = req.data;
    console.log('Action Trigger', req.data);
    if (!storeId || !businessDate) {
      return req.reject(400, 'Missing storeId or businessDate');
    }

    // Build UPDATE payload (numbers only)
    const data = {};

    for (const [k, v] of Object.entries(values || {})) {
      if (v !== null && v !== undefined) {
        if (k === 'comments') {
          data[k] = v;
        } else {
          const num = Number(v);
          if (!Number.isFinite(num)) {
            return req.reject(400, `Invalid number for ${k}`);
          }
          // data[k] = num;
          data[k] = round2(num);
        }
      }
    }

    if (!Object.keys(data).length) {
      return req.reject(400, 'No values provided');
    }
    let tx;
    try {
      // Enforce workflow
      data.status = 'INPROGRESS';
      tx = cds.tx(req);
      const updated = await tx.run(UPDATE(lotteryBalancing)
        .set(data)
        .where({ storeId, businessDate }));

      if (updated === 0) {
        return req.reject(404, 'Record not found');
      }
      const result = await tx.run(SELECT.one.from(lotteryBalancing)
        .where({ storeId, businessDate }));
      await tx.commit();
      return result;
    } catch (error) {
      if (tx) await tx.rollback();
      return { success: false, message: `Update failed: ${error.message} ` };
    }
  });

  // ====== Locking configuration ======
  const LOCK_TTL_MINUTES = timeOut;                           // auto-expire after 15 minutes
  const now = () => new Date();
  const addMinutes = (d, m) => new Date(d.getTime() + m * 60000);

  const userIdOf = (req) => (req.user && req.user.id) || 'anonymous';

  // Helper: read active (non-expired) lock
  async function _readActiveLock(storeId, weekEnding, { editLocks }) {
    const row = await SELECT.one.from(editLocks).where({ storeId, weekEnding });
    if (!row) return null;
    if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) return null;
    return row;
  }

  // ====== ACTIONS ======
  srv.on('acquireWeekLock', async (req) => {
    const { storeId, weekEnding } = req.data;

    console.log('lock Parameters for time out', timeOut);
    console.log('lock parameters for  heartbeat', HEARTBEAT_INTERVAL);
    if (!storeId || !weekEnding) return req.reject(400, 'Missing storeId or weekEnding');

    const uid = userIdOf(req);
    const existing = await _readActiveLock(storeId, weekEnding, { editLocks });

    if (existing && existing.lockOwner !== uid) {
      return {
        success: false,
        message: `Locked by ${existing.lockOwner} since ${existing.lockedAt} `,
        lockOwner: existing.lockOwner,
        lockedAt: existing.lockedAt,
        expiresAt: existing.expiresAt
      };
    }

    // Insert or refresh my lock
    const t = now();
    const exp = addMinutes(t, LOCK_TTL_MINUTES);
    const up = {
      storeId,
      weekEnding,
      lockOwner: uid,
      lockedAt: t.toISOString(),
      expiresAt: exp.toISOString()
    };

    // Upsert
    const upCount = await UPDATE(editLocks).set(up).where({ storeId, weekEnding });
    if (!upCount) await INSERT.into(editLocks).entries(up);

    return { success: true, message: 'Lock acquired', lockOwner: uid, lockedAt: up.lockedAt, expiresAt: up.expiresAt };
  });

  srv.on('releaseWeekLock', async (req) => {
    const { storeId, weekEnding } = req.data;

    if (!storeId || !weekEnding) return req.reject(400, 'Missing storeId or weekEnding');

    const uid = userIdOf(req);
    const row = await SELECT.one.from(editLocks).where({ storeId, weekEnding });

    if (!row) return { success: true, message: 'No lock present' };

    // Only owner can release (you can add a role check here if managers should force-release)
    if (row.lockOwner !== uid) return req.reject(403, `Lock owned by ${row.lockOwner} `);

    await DELETE.from(editLocks).where({ storeId, weekEnding });
    return { success: true, message: 'Lock released' };
  });

  srv.on('getWeekLock', async (req) => {
    const { storeId, weekEnding } = req.data;

    if (!storeId || !weekEnding) return req.reject(400, 'Missing storeId or weekEnding');

    const row = await _readActiveLock(storeId, weekEnding, { editLocks });
    if (!row) return { locked: false, lockOwner: null, lockedAt: null, expiresAt: null };
    return { locked: true, lockOwner: row.lockOwner, lockedAt: row.lockedAt, expiresAt: row.expiresAt };
  });

  async function _ensureLockOwnerOrFail(req, storeId, weekEnding) {
    const uid = userIdOf(req);
    // const { editLocks } = cds.entities('ci.lottery.core');
    const active = await _readActiveLock(storeId, weekEnding, { editLocks });
    if (!active) return req.reject(423, 'Week is not locked. Please enter Edit to acquire lock.');
    if (active.lockOwner !== uid) return req.reject(423, `Locked by ${active.lockOwner}. Try again later.`);
  }

  // lock functionality
  /**
  * Calculate the 7 dates (Sunâ€“Sat) for a given week ending Saturday
  * @param {string} weekEndingSaturday - 'YYYY-MM-DD' (must be a Saturday)
  * @returns {string[]} Array of 7 date strings ['2026-02-08', ... '2026-02-14']
  */
  function getWeekDates(weekEndingSaturday) {
    const saturday = new Date(weekEndingSaturday);
    saturday.setHours(0, 0, 0, 0);

    const dates = [];

    // Sunday is 6 days before Saturday
    for (let i = 6; i >= 0; i--) {
      const d = new Date(saturday);
      d.setDate(saturday.getDate() - i);

      // Format as YYYY-MM-DD in LOCAL timezone
      const formatted =
        d.getFullYear() + "-" +
        String(d.getMonth() + 1).padStart(2, "0") + "-" +
        String(d.getDate()).padStart(2, "0");

      dates.push(formatted);
    }
    return dates;
  };

  function round2(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return 0;
    return Math.round((v + Number.EPSILON) * 100) / 100;
  }
  /**
   * Calculate the week ending Saturday for any given date
   * @param {string} dateStr - 'YYYY-MM-DD'
   * @returns {string} Saturday date string
   */
  function getWeekEndingSaturday(dateStr) {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);

    const dayOfWeek = d.getDay(); // local
    const daysUntilSat = (6 - dayOfWeek + 7) % 7;

    d.setDate(d.getDate() + daysUntilSat);

    return (
      d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0")
    );
  };
  /**
   * Get the dates to lock based on mode
   * @param {string} lockMode - 'WEEKLY' or 'DAILY'
   * @param {string} businessDate - specific date (used for DAILY)
   * @param {string} weekEnding - Saturday (used for WEEKLY)
   * @returns {string[]} Array of date strings to lock
   */
  function getDatesToLock(lockMode, businessDate, weekEnding) {
    if (lockMode === 'WEEKLY') {
      return getWeekDates(weekEnding);
    } else {
      // DAILY â€” single date
      return [businessDate];
    }
  };
  // const { editLocks } = srv.entitis;
  srv.on('acquireLock', async (req) => {
    const { lockMode, storeId, businessDate, weekEnding } = req.data;
    console.log("input data :", lockMode, storeId, businessDate, weekEnding);
    const userId = req.user?.id || 'anonymous';

    if (!lockMode || !storeId) {
      return req.error(400, 'lockMode and storeId are required');
    }
    if (lockMode === 'WEEKLY' && !weekEnding) {
      return req.error(400, 'weekending is required for WEEKLY mode');
    }
    if (lockMode === 'DAILY' && !businessDate) {
      return req.error(400, 'business Date is required for Daily mode');
    }
    const appSource = lockMode === 'WEEKLY' ? 'WEEKLY_APP' : 'DAILY_APP';
    console.log('check acquire:', appSource);
    // Determine the week ending for both modes
    const effectiveWeekEnding = lockMode === 'WEEKLY'
      ? weekEnding
      : getWeekEndingSaturday(businessDate);
    // Get dates this lock request covers
    const datesToLock = getDatesToLock(lockMode, businessDate, effectiveWeekEnding);
    console.log('dates', datesToLock);
    // 1. Clean up expired locks for ALL dates in range
    const now = new Date();
    const nowISO = now.toISOString();
    await DELETE.from(editLocks).where({
      storeId,
      businessDate: { in: datesToLock },
      expiresAt: { '<': nowISO }
    });
    // 2. Check for conflicting locks on ANY of these dates
    const existingLocks = await SELECT.from(editLocks).where({
      storeId,
      businessDate: { in: datesToLock }
    });
    console.log('existing locks', existingLocks);
    if (existingLocks.length > 0) {
      // Check if ALL existing locks belong to same user with same mode
      const allMine = existingLocks.every(
        lock => lock.lockedBy === userId && lock.lockMode === lockMode
      );
      if (allMine) {
        // Same user, same mode â€” refresh the locks
        const newExpiry = new Date(now.getTime() + LOCK_TIMEOUT_MS);
        await UPDATE(editLocks)
          .set({
            expiresAt: newExpiry.toISOString(),
            heartbeatAt: now.toISOString()
          })
          .where({
            storeId,
            businessDate: { in: datesToLock },
            lockedBy: userId
          });
        return {
          success: true,
          lockedBy: userId,
          // lockedByName: userName,
          lockMode: lockMode,
          appSource: appSource,
          message: 'Lock refreshed',
          conflicts: []
        };
      }
      // Conflict! â€” other user or cross-mode lock
      const conflicts = existingLocks
        .filter(lock => lock.lockedBy !== userId || lock.lockMode !== lockMode)
        .map(lock => ({
          businessDate: lock.businessDate,
          lockedBy: lock.lockedBy,
          // lockedByName: lock.lockedByName,
          lockMode: lock.lockMode,
          appSource: lock.appSource
        }));
      // Build a user-friendly message
      const uniqueUsers = [...new Set(conflicts.map(c => c.lockedBy))];
      const conflictDates = conflicts.map(c => c.businessDate).join(', ');
      const modeDesc = conflicts[0]?.lockMode === 'WEEKLY'
        ? 'weekly editing'
        : 'daily editing';
      let message;
      if (lockMode === 'WEEKLY' && conflicts[0]?.lockMode === 'DAILY') {
        message = `Cannot lock week â€” ${uniqueUsers.join(', ')} is editing date(s): ${conflictDates} in Daily App`;
      } else if (lockMode === 'DAILY' && conflicts[0]?.lockMode === 'WEEKLY') {
        message = `Cannot edit â€” ${uniqueUsers.join(', ')} is editing the full week(${conflicts[0]?.appSource}) ending ${effectiveWeekEnding} `;
      } else {
        message = `Record is being edited by ${uniqueUsers.join(', ')} (${modeDesc})`;
      }
      return {
        success: false,
        lockedBy: conflicts[0]?.lockedBy,
        // lockedByName: conflicts[0]?.lockedByName,
        lockMode: conflicts[0]?.lockMode,
        appSource: conflicts[0]?.appSource,
        message: message,
        conflicts: conflicts
      };
    }
    // 3. No conflicts â€” create lock rows for all dates
    const newExpiry = new Date(now.getTime() + LOCK_TIMEOUT_MS);
    const lockEntries = datesToLock.map(date => ({
      storeId,
      businessDate: date,
      lockMode,
      weekEnding: effectiveWeekEnding,
      lockedBy: userId,
      // lockedByName: userName,
      lockedAt: now,
      expiresAt: newExpiry,
      heartbeatAt: now,
      appSource
    }));
    console.log('input Data', lockEntries);
    await INSERT.into(editLocks).entries(lockEntries);
    return {
      success: true,
      lockedBy: userId,
      // lockedByName: userName,
      lockMode: lockMode,
      appSource: appSource,
      message: lockMode === 'WEEKLY'
        ? `Week locked(${datesToLock[0]} to ${datesToLock[6]})`
        : `Date ${businessDate} locked`,
      conflicts: []
    };
  });
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RELEASE LOCK
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  srv.on('releaseLock', async (req) => {
    const { lockMode, storeId, businessDate, weekEnding } = req.data;
    const userId = req.user?.id || 'anonymous';
    const effectiveWeekEnding = lockMode === 'WEEKLY'
      ? weekEnding
      : (businessDate ? getWeekEndingSaturday(businessDate) : null);
    const datesToRelease = getDatesToLock(
      lockMode, businessDate, effectiveWeekEnding
    );
    await DELETE.from(editLocks).where({
      storeId,
      businessDate: { in: datesToRelease },
      lockedBy: userId
    });
    return {
      success: true,
      message: 'Lock released'
    };
  });
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RENEW LOCK (Heartbeat)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  srv.on('renewLock', async (req) => {
    const { lockMode, storeId, businessDate, weekEnding } = req.data;
    console.log('renew lock');
    const userId = req.user?.id || 'anonymous';
    const effectiveWeekEnding = lockMode === 'WEEKLY'
      ? weekEnding
      : (businessDate ? getWeekEndingSaturday(businessDate) : null);
    const datesToRenew = getDatesToLock(
      lockMode, businessDate, effectiveWeekEnding
    );
    const now = new Date();
    const newExpiry = new Date(now.getTime() + LOCK_TIMEOUT_MS);
    const result = await UPDATE(editLocks)
      .set({
        expiresAt: newExpiry.toISOString(),
        heartbeatAt: now.toISOString()
      })
      .where({
        storeId,
        businessDate: { in: datesToRenew },
        lockedBy: userId
      });
    if (result === 0) {
      console.log('update results', datesToRenew, storeId);
      return {
        success: false,
        message: 'Lock expired. Another user may have taken over. Please re-enter edit mode.'
      };
    }
    return {
      success: true,
      message: 'Lock renewed'
    };
  });
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CHECK LOCK (Read-only â€” called on page load)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  srv.on('checkLock', async (req) => {
    const { storeId, businessDate, weekEnding } = req.data;
    console.log('lock Parameters for time out', timeOut);
    console.log('lock parameters for  heartbeat', HEARTBEAT_INTERVAL);
    const userId = req.user?.id || 'anonymous';
    console.log('User ID', userId);
    // Determine which dates to check
    let datesToCheck;
    if (weekEnding) {
      datesToCheck = getWeekDates(weekEnding);
    } else if (businessDate) {
      datesToCheck = [businessDate];
    } else {
      return { isLocked: false, locks: [] };
    }
    // Clean expired
    const now = new Date().toISOString();
    console.log('business Date', businessDate);
    console.log('business Date datesToCheck', datesToCheck);
    console.log('current date', now);
    await DELETE.from(editLocks).where({
      storeId,
      businessDate: { in: datesToCheck },
      expiresAt: { '<': now }
    });
    console.log('business Date delete', datesToCheck);
    // Fetch active locks
    const activeLocks = await SELECT.from(editLocks).where({
      storeId,
      businessDate: { in: datesToCheck }
    });
    console.log('business Date select', datesToCheck);
    if (activeLocks.length === 0) {
      return {
        isLocked: false,
        lockedBy: null,
        lockedByName: null,
        lockMode: null,
        appSource: null,
        isMyLock: false,
        locks: []
      };
    }
    const firstLock = activeLocks[0];
    const allMine = activeLocks.every(l => l.lockedBy === userId);
    return {
      isLocked: true,
      lockedBy: firstLock.lockedBy,
      lockedByName: firstLock.lockedByName,
      lockMode: firstLock.lockMode,
      appSource: firstLock.appSource,
      isMyLock: allMine,
      locks: activeLocks.map(l => ({
        businessDate: l.businessDate,
        lockedBy: l.lockedBy,
        lockedByName: l.lockedByName,
        lockMode: l.lockMode,
        appSource: l.appSource
      }))
    };
  });
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // BEFORE GUARD â€” Blocks writes if user doesn't hold the lock
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  srv.before(['UPDATE', 'DELETE'], 'lotteryBalancing', async (req) => {
    const { storeId, businessDate } = req.data;
    if (storeId && businessDate) {
      try {
        await _assertUserHoldsLock(storeId, businessDate, req);
        console.log('update for ', storeId, businessDate);
      } catch (err) {
        console.log('error on update', err.message, storeId, businessDate);
      }
    }
  });
  // â”€â”€ Internal helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function _assertUserHoldsLock(storeId, businessDate, req) {
    const userId = req.user?.id || 'anonymous';
    const now = new Date().toISOString();
    // Clean expired
    await DELETE.from(editLocks).where({
      storeId,
      businessDate,
      expiresAt: { '<': now }
    });
    const lock = await SELECT.one.from(editLocks).where({
      storeId, businessDate
    });
    if (lock && lock.lockedBy !== userId) {
      const modeLabel = lock.appSource === 'WEEKLY_APP' ? 'Weekly App' : 'Daily App';
      return req.reject(
        423,
        `Record is locked by ${lock.lockedBy} (${modeLabel}). Please try again later.`
      );
    }
  };
  /**
   */
  // async function assertUserHoldsLock(storeId, businessDate, req) {
  //   const userId = req.user?.id || 'anonymous';
  //   const now = new Date().toISOString();
  //   await DELETE.from(editLocks).where({
  //     storeId, businessDate, expiresAt: { '<': now }
  //   });
  //   const lock = await SELECT.one.from(editLocks).where({
  //     storeId, businessDate
  //   });
  //   if (lock && lock.lockedBy !== userId) {
  //     const modeLabel = lock.appSource === 'WEEKLY_APP' ? 'Weekly App' : 'Daily App';
  //     return req.error(
  //       423,
  //       `Record is locked by ${ lock.lockedByName } (${ modeLabel }). Please try again later.`
  //     );
  //   }
  // };

  async function triggerBPAProcess(params, req) {
    const variance = Math.abs(params.totalVariance ?? 0);
    const BPA_DEFINITION_ID = process.env.BPA_DEFINITION_ID


    try {
      const tx = await cds.connect.to("WORKDAY_EMP_MASTERDATA");
      // let jobCodes = JOB_CODE.split('|').map(String);
      const jobCodes = (JOB_CODE || '')
        .split('|')
        .map(code => code.trim())
        .filter(Boolean);

      console.log(jobCodes);
      const results = await tx.run(SELECT.from('employeeRoleView').where({ Club: params.storeId, Job_Code: { in: jobCodes } }));
      const data = Array.isArray(results)
        ? results
        : Array.isArray(results?.value)
          ? results.value
          : [];
      const mailList = [...new Set(
        data
          .map(r => r.Email?.trim())
          .filter(Boolean)
      )].join(',');
      if (!mailList) {
        // console.error('No Manager foud to trigger the Mail notification');
        // throw error;
        throw new Error('No manager found to trigger mail notification');
      };
      const payload = {
        "definitionId": BPA_DEFINITION_ID,
        "context": {
          // "initiatedBy": req.user.id,
          "club": params.storeId,
          "weekending": params.weekEnding,
          "threshold": thresHold,
          "url": params.appUrl,
          "variance": variance,
          "maillist": mailList
        }
      }
      const bpa = await cds.connect.to('BPA_API');
      const response = await bpa.tx(req).post('/' + process.env.BPA_ENDPOINT,
        payload
      );
      console.log('BPA Process triggered:', response);
      return response?.data;

    } catch (error) {
      console.error('BPA trigger failed:', error.response?.data || error.message);
      throw new error('BPA trigger failed:' + (error.response?.data?.error?.message || error.message));
      // throw error;
    }
  };
};