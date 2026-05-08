# Incture TRE Backend (CAPM)

This is an SAP Cloud Application Programming Model (CAP) Node.js backend application. It serves as the core engine for the **Transaction Reprocessing Engine (TRE)**, handling the synchronization, tracking, and reprocessing of failed SAP IDocs.

---

## 📁 Core Backend API Logic & Internal File Workflows

This application is entirely backend-focused. Below is a deep dive into the specific files, their OData definitions (`.cds`), and their internal business logic (`.js`).

### 1. Failed IDoc Operations
**Files:** `srv/failed-idoc.cds` & `srv/failed-idoc.js`

- **`srv/failed-idoc.cds`**:
  - Defines the `FailedIdocService`.
  - Exposes `FailedIdocHeaders` and `FailedIdocItems` as read-only projections for the frontend.
  - Exposes `FailedIdocSummary`, a customized projection that groups IDocs by `idocType`, `messageType`, `landscape`, `errorStatusCode`, and `date` (casting `createdAt` to Date) to feed the UI dashboard. Includes `@Search` annotations.
  - Exposes two actions:
    1. `loadFailedIdocHeaders`: Triggers the background sync job.
    2. `getIdocData`: Fetches specific IDoc segment details.

- **`srv/failed-idoc.js`**:
  - Contains the logic for `loadFailedIdocHeaders`. It loops through the `MessageTypesForMetadata` config to determine which SAP systems to query.
  - Connects to SAP BTP destinations dynamically and fetches `EDIDC` (Header) and `EDIDD` (Segment) data.
  - Implements an **upsert logic** mechanism: It inserts new IDocs into the database, but for existing IDocs, it only updates them if their error status has changed.
  - Contains an automatic date backfill feature mapping SAP's `Credat` field to `createdOn`.
  - Contains local mock data generators (`USE_MOCK_FAILED_IDOC`) for offline UI development.

---

### 2. Metadata & Admin Configuration
**Files:** `srv/service.cds`, `srv/metadata-load.cds`, & `srv/metadata-load.js`

- **`srv/service.cds`**:
  - Defines the `tRE_Admin` service.
  - Exposes the core configuration tables used by the application: `MessageTypesForMetadata`, `ErrorCodes`, and `SchedulerConfig`.
  - Defines the `loadMetadata(messageType, systemAlias)` bound action on the `MessageTypesForMetadata` entity.

- **`srv/metadata-load.cds`**:
  - Defines the `tRE_Metadata` service.
  - Exposes the internal, read-only structures required for the UI to dynamically render IDoc structures: `MessageTypes`, `IdocTypes`, `Segments`, and `Fields`.

- **`srv/metadata-load.js`**:
  - Implements the internal logic for the `loadMetadata` bound action.
  - **Cleanup**: If a config record is marked as `active: false`, it safely deletes all associated metadata from `MessageTypes`, `IdocTypes`, `Segments`, and `Fields`.
  - **Fetch & Transform**: Connects to the SAP system (`ZIDOC_METADATA_SRV`) to fetch the `MESTYPINFOSet` endpoint. It then transforms this flat/hierarchical SAP response into the application's legacy relational structure.
  - **Persistence**: Safely inserts the newly parsed metadata into the database using auto-generated UUIDs and returns the total count of loaded segments and fields.

---

### 3. IDoc Reprocessing & Auditing
**Files:** `srv/reprocess.cds` & `srv/reprocess.js`

- **`srv/reprocess.cds`**:
  - Defines the `ReprocessService`.
  - Exposes `ReprocessHeaders` and `ReprocessItems` (annotated with `@Search.searchable: true`) to provide a read-only audit history of every correction attempt made.
  - Exposes the actions `submitReprocessAttempt`, `updateReprocessResult`, and `archiveReprocessed`.

- **`srv/reprocess.js`**:
  - **`submitReprocessAttempt`**: 
    1. Persists the user's attempt in `ReprocessHeaders` (status: `SUBMITTED`) and loops through all field `changes` (old vs new values) to insert them into `ReprocessItems` for auditing.
    2. Reconstructs the payload and triggers an HTTP POST request (`executeHttpRequest`) to the external SAP CPI endpoint (`CPI_IFLOW_DEST` -> `/http/IdocReprocessing`), forwarding the corrected IDoc back to SAP.
  - **`updateReprocessResult`**:
    - Acts as an incoming webhook/callback for SAP CPI to update the status of an attempt.
    - If CPI reports success, it updates `ReprocessHeaders` to `RE-PROCESSED` and automatically updates the original `FailedIdocHeaders` record, clearing its `errorFlag`.
  - **`archiveReprocessed`**:
    - A maintenance action that locates all successfully `RE-PROCESSED` attempts and permanently deletes them from `ReprocessHeaders`, `ReprocessItems`, and `FailedIdocHeaders` to keep the primary operational database clean.

---

## ⏱️ Background Scheduler (`srv/scheduler.js`)

Unlike standard API-driven CAP apps that only react to HTTP requests, this project contains an autonomous scheduler.
- Hooks directly into the CAP bootstrap event (`cds.on('served')`).
- Reads the `SchedulerConfig` table from the database to determine the polling interval.
- Automatically triggers the `loadFailedIdocHeaders` sync job in the background using a privileged system user context (`new cds.User.Privileged()`). This allows the backend to continuously sync SAP data without requiring an active user session or XSUAA token.

---

## 🛠️ Global API Enhancements

- **Cross-Origin Resource Sharing (CORS)**: Globally enabled in `server.js` using the `cors` package to allow the frontend UI to consume the APIs from different domains or local development ports.
- **Advanced OData Search**: Core entities across multiple CDS files are annotated with `@Search.searchable: true`. String fields are explicitly mapped, enabling native UI5 fuzzy search and complex `$filter` queries out-of-the-box.

---

## 🚀 Running Locally

1. **Install dependencies**: `npm install`
2. **Start the server**: `npm start` or `cds watch` (This will use the in-memory SQLite database for local development).
3. **Mock Data**: Local mock data is provided inside `.js` files. To use it without requiring an active SAP BTP connection, start your server with the environment variables: `USE_MOCK_FAILED_IDOC=true` and `USE_MOCK_METADATA=true`.
