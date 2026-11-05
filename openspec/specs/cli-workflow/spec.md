# CLI Workflow Specification

## Purpose

Provides an interactive Bahasa Indonesia command-line workflow for credential entry, activity selection, single-prompt `keterangan` configuration, upload progress feedback, and multi-batch execution within a single session.

## Requirements

### Requirement: Credential input with .env fallback

The system SHALL read `BOT_USERNAME` and `BOT_PASSWORD` from `.env` if both are non-empty; otherwise, it SHALL prompt the user interactively in Bahasa Indonesia for their email/username and password.

#### Scenario: Credentials provided in .env

- **WHEN** both `BOT_USERNAME` and `BOT_PASSWORD` are set in `.env`
- **THEN** the system logs in automatically using those credentials and displays the active account in Bahasa Indonesia without prompting

#### Scenario: Credentials missing from .env

- **WHEN** either `BOT_USERNAME` or `BOT_PASSWORD` is unset or empty
- **THEN** the system prompts the user in Bahasa Indonesia for email/username and masked password with non-empty validation

### Requirement: Activity selection with folder file counts and empty-folder rescan

The system SHALL display an interactive selection list of fetched activities in Bahasa Indonesia showing the number of supported image files currently inside each `images/<sanitizedActivityName>/` folder, and SHALL allow rescanning if the chosen folder is empty.

#### Scenario: Selecting an activity with existing images

- **WHEN** the user selects an activity whose folder contains 10 supported images
- **THEN** the system proceeds to the `keterangan` mode prompt for that activity

#### Scenario: Selecting an activity whose folder is currently empty

- **WHEN** the user selects an activity whose folder has 0 supported images
- **THEN** the system informs the user in Bahasa Indonesia that the folder is empty and offers to rescan after adding files or return to activity selection without re-authenticating

### Requirement: Once-per-batch keterangan mode selection

The system SHALL ask the user once per batch, prior to starting uploads, to choose between two `keterangan` modes: using the activity name (`activityName`, default) or using each file's name without extension.

#### Scenario: Default activityName keterangan selected

- **WHEN** the user selects the default option ("Gunakan nama aktivitas") before confirming the batch
- **THEN** every file in the batch is uploaded with `keterangan` set to the selected `activityName` without prompting again per file

#### Scenario: Filename keterangan selected

- **WHEN** the user selects the filename option ("Gunakan nama berkas (tanpa ekstensi)") before confirming the batch
- **THEN** each file in the batch (e.g., `Kunjungan_Pagi.png`) is uploaded with `keterangan` set to its filename without extension (`"Kunjungan_Pagi"`) without prompting again per file

### Requirement: Batch confirmation, progress reporting, and multi-batch loop

The system SHALL ask for confirmation showing the total image count before starting the upload loop, display progress and remaining file count in Bahasa Indonesia during execution, and ask whether the user wants to upload another activity batch upon completion.

#### Scenario: User chooses to upload another batch after completion

- **WHEN** a batch finishes and the user confirms "Ingin mengunggah aktivitas lain?"
- **THEN** the system refreshes folder counts and returns to the activity selection prompt using the existing authenticated session

#### Scenario: User finishes and exits

- **WHEN** a batch finishes and the user declines "Ingin mengunggah aktivitas lain?"
- **THEN** the system displays a closing message in Bahasa Indonesia and exits cleanly

### Requirement: Verbose error payload visibility

The system SHALL hide detailed API error payloads from the terminal by default to keep error output clean and concise in Bahasa Indonesia, and SHALL display full API error payloads only when invoked with the `--verbose` or `-v` flag (or `VERBOSE=true`).

#### Scenario: Error encountered without verbose flag

- **WHEN** an API error occurs and `--verbose` is not provided
- **THEN** the system displays only the high-level error message and HTTP status without printing the raw API response body

#### Scenario: Error encountered with verbose flag

- **WHEN** an API error occurs and the program was launched with `--verbose` or `-v`
- **THEN** the system displays the high-level error message along with the detailed API response payload
