# Mitra Activity Upload Specification

## Purpose

Discovers the authenticated user's organizational context and available Mitra activities, synchronizes local per-activity image directories, compresses images in memory, and submits activity cases sequentially with retry and file cleanup.

## Requirements

### Requirement: User context and dynamic activity discovery
The system SHALL fetch the user's organizational context from `GET /api/mitra/v1/aktivitas-mitra/mulai/context` and use the selected context (`pyCompany`, `divisionId`, `departmentId`, `sectionId`) to fetch available activities from `GET /api/mitra/v1/aktivitas-mitra/mulai/activities`.

#### Scenario: Single context option auto-selected
- **WHEN** `/api/mitra/v1/aktivitas-mitra/mulai/context` returns `options` with exactly 1 entry
- **THEN** the system automatically selects `options[0]` without prompting the user and fetches activities for that context

#### Scenario: Multiple context options presented
- **WHEN** `/api/mitra/v1/aktivitas-mitra/mulai/context` returns `options` with more than 1 entry
- **THEN** the system prompts the user in Bahasa Indonesia to select which division/department/section context to use before fetching activities

### Requirement: Local directory synchronization and image filtering
The system SHALL ensure `images/trash/` and `images/<sanitizedActivityName>/` directories exist for all fetched activities, replacing `/` and `\` in activity names with spaces, and SHALL scan only supported image files (`.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`, `.avif`, `.bmp`, `.tiff`).

#### Scenario: Activity directories created after login
- **WHEN** the activity list is returned from `/api/mitra/v1/aktivitas-mitra/mulai/activities`
- **THEN** the system creates `images/trash/` and `images/<sanitizedActivityName>/` for every activity if they do not already exist

#### Scenario: Non-image files ignored during directory scan
- **WHEN** an activity folder contains both supported images (e.g. `foto1.jpg`, `foto2.png`) and non-image or hidden files (e.g. `Thumbs.db`, `.DS_Store`, `notes.txt`)
- **THEN** only the supported image files are counted and queued for upload, and non-image files are left untouched

### Requirement: In-memory image compression
The system SHALL compress each queued image in memory into a JPEG `Blob` without writing temporary `.temp/` files to disk: images with `width > 1920` SHALL be resized to `Math.round(width / 4)` and encoded at JPEG quality `75`, while images with `width <= 1920` SHALL keep their original dimensions and be encoded at JPEG quality `60`.

#### Scenario: High-resolution image > 1920px wide
- **WHEN** an input image has width `4000` pixels
- **THEN** the system resizes it to width `1000` preserving aspect ratio and encodes it as a JPEG `Blob` at quality `75`

#### Scenario: Standard-resolution image <= 1920px wide
- **WHEN** an input image has width `1280` pixels
- **THEN** the system preserves its `1280` width and encodes it as a JPEG `Blob` at quality `60`

### Requirement: Sequential case creation, upload, and retry
The system SHALL upload images sequentially (one file at a time) by calling `POST /api/mitra/v1/aktivitas-mitra/mulai` with `{ ...userCtx, activityId }` to obtain a `caseNumber`, followed by `POST /api/mitra/v1/aktivitas-mitra/selesai` with multipart `FormData` (`caseNumber`, `keterangan`, `file`). Transient errors SHALL be retried up to 3 times with backoff, reusing the existing `caseNumber` if `/mulai` already succeeded.

#### Scenario: Successful two-step activity upload
- **WHEN** an image is compressed and submitted through `/mulai` and `/selesai`
- **THEN** `/selesai` returns the completed case record and the original source image is moved to `images/trash/<filename>`

#### Scenario: Transient failure on /selesai reuses caseNumber
- **WHEN** `/mulai` succeeds with `caseNumber` `"CASE-123"` and `/selesai` fails with a network timeout or HTTP 5xx error
- **THEN** the system retries `/selesai` (up to 3 attempts) using the same `caseNumber` `"CASE-123"` without calling `/mulai` again

#### Scenario: Persistent failure preserves source file
- **WHEN** a file fails compression or fails `/mulai` or `/selesai` after all 3 retry attempts
- **THEN** the system appends the error details to `error.log`, leaves the original file in `images/<sanitizedActivityName>/` for future retry, and continues processing the next file in the batch
