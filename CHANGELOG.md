# CHANGELOG
## v25.8.2 (Pre-Release)
_Released on August 9, 2025_

### [PRO] JSON Patch
Updating JSON values will now attempt to update the structure sparsely using SQLite's built-in `json_patch` and `jsonb_patch` utilities. 
This can be useful when another process has modified the JSON value while manually editing the value through the extension UI.
Rather than overwriting the entire JSON value, only the properties that changed in the edit will be applied, preserving non-conflicting external changes. 

This should be particularly useful when [editing values in a VS Code tab](#pro-edit-in-vs-code) and the [Instant Commit](#v2560-pre-release) setting.

Beware that this feature is still experimental and has a few sharp edges:
- Conflicts will still be resolved in favor of last-write, same as in the case of non-JSON values. 
- This is subject to the limitations of SQLite's [patch functions](https://www.sqlite.org/json1.html#jpatch), specifically with respect to arrays, which are overwritten in whole.
- For textual `JSON` values, it will only attempt the new patch behavior if both values are strict RFC-8259 JSON values. SQLite supports a more relaxed standard for JSON, which also allows code comments. Applying patches through `json_patch` would not preserve these. 
`JSONB` columns do not have this limitation.
- This feature is not available for batch updates

### Fixes
- [PRO] Fixed file upload UI not showing correctly when dropping a file onto a field in the 'New Row' dialog
- [PRO] Fixed a bug that made entering numeric values in the 'New Row' dialog difficult
- [PRO] JSON/B input field are now rendered correctly in 'New Row' dialog

### Known Issues
- Editing `BLOB`s with the 'Edit in VS Code' feature and the Hex Editor extension will write incorrect results back to the db.

## v25.8.1 (Pre-Release)
_Released on August 7, 2025_

### [PRO] Drag & Drop File as BLOB
You can now drag and drop a file into the sidebar or modal fieldset to upload its content as a `BLOB` in the corresponding column. This is an alternative to the file picker and not limited to `BLOB` columns.
This works with both OS files from the File Explorer/Finder as well as VS Code files from the file tree.

### Changes
- [PRO] Removed per-cell datetime formats. The datetime format is now guessed per column.
- [PRO] Datetime format is now always shown in the header cell and its behavior is now the same as the one in the sidebar.
- [PRO] Fixed editing cell values in VS Code when column names include `/`.

### Known Issues
- Poor performance for uploading larger files
- Missing loading indicators when undoing file uploads

## v25.8.0 (Pre-Release)
_Released on August 1, 2025_

### [PRO] Edit in VS Code
You can now edit individual cell values in a tab in VS Code, making full use of VS Code's text editing features, installed extensions (Vim mode!), 
syntax highlighting, and more. This should be particularly useful when editing JSON/B columns. 

You can access this feature through the "Edit in VS Code to the Side" icon button in the top right corner of a text area (visible on hover).
There is now also a VS Code setting to configure the behavior of a cell double-click, allowing you to open it in the new VS Code tab feature instead of the built-in modal dialog.

This feature also makes use of VS Code's text syntax detection feature to open tabs with appropriate formatting pre-applied. This can be useful when storing HTML responses or Markdown content in SQLite.

For improved ergonomics, the behavior of the SQLite Viewer sidebar has been modified to auto-close when space is running low (i.e., when a VS Code tab opens to the side) and to auto-show when it becomes available again.

### Changes
- [PRO] UTC/local time zone toggle is now always visible in column headers
- Improved queries for tables without `ROWID` and multiple primary keys
- Using BLOBs as primary keys in tables without `ROWID` now works, provided they are small (<= 48 bytes).
- Added a "Copy to clipboard" button to text areas that allows copying values to the clipboard without text cutoff limits
- Added an ellipsis "…" to the end of text values that were cut off due to size
- "Click to select" on text fields should be a little less finicky now
- Improved responsive sidebar handling with better width management
- Added "Open in VS Code" functionality to the Table Info SQL field
- Improved error handling, so that the sidebar is still accessible when an error occurs
- [PRO] Fixed invalid output when exporting a table with exactly 1 row as a JSON object
- [PRO] Fixed a bug that prevented deleting rows in tables without `ROWID`

### Known Issues
- Exporting from within the viewer is broken when multiples DBs of the same name are open (export from the command pallette not affected)

## v25.7.0 (Pre-Release)
_Released on July 17, 2025_

### [PRO] Export Dialog
Introduced a new export command for saving table data in multiple formats.
This feature is designed as an alternative to the selection/clipboard-based export, especially for larger tables. 
Exported data is written directly to a file. 

You can launch the export either as a standalone command from the Command Palette or through a modal dialog within the viewer. The modal dialog supports sorting and filtering, just like the clipboard export.

While this method can handle larger datasets than the clipboard export, it is still limited by JS' performance and the overhead of data marshalling. For exporting large tables (1M+ rows), a dedicated export tool is recommended.

### Fixes
- [PRO] Fixed a bug that prevented images from being embedded in exported data.
- [PRO] The cutoff for inlined BLOBs can now be configured from the export dialog (also affects clipboard export) and now defaults to 10KB.
- Fixed an issue where the left sidebar could not be snapped to its minimum position.
- Added a warning when attempting to select more than 10,000 rows.

## v25.6.1 (Pre-Release)
_Released on June 30, 2025_

- Added forward and backward button
- Moved 'Expand All' button inside the sidebar (only visible on hover; same as VS Code explorer)
- Section headers in the left sidebar are now sticky
- Updated various dependencies

## v25.6.0 (Pre-Release)
_Released on June 23, 2025_

- [PRO] Added an "Instant Commit" setting that prevents the extension from opening long-running transactions that block other SQLite processes. Use with caution, as undo/redo functionality is limited in this mode.
- [PRO] Added "Instant Commit" toggle to viewer UI to temporarily toggle the instant commit feature per database. Note that this toggle is only visible if the global setting applies to the given file.
- Updated SQLite and SQLite WASM to 3.50.1
- Various other changes and fixes

## v25.5.4 (Pre-Release)
_Released on May 9, 2025_

Fixed visual row number alignment issue

## v25.5.3 (Pre-Release)
_Released on May 9, 2025_

- [PRO] Fixed a bug that prevented undoing delete operations in tables with generated columns after tx commit
- [PRO] Changing numeric values in non-numeric column types will no longer change the type to text
- [PRO] Disabled Pragmas when opening a readonly database
- Boolean columns are now rendered as readonly checkboxes
- Valid JSON values will now be pretty-printed regardless of column type
- Numeric values will now be rendered in code font regardless of column type
- Text values should now be rendered as text regardless of column type
- Rearranged cell layout for BLOBs. 
  The download button is now on the right side, no longer in the same spot as image preview.
- Now showing the file type of blobs (e.g. "PNG") on the download button
- Will no longer run SQLite queries originating from the sidebar when the sidebar is closed
- Added dedicated symbol for `ANY` type columns

## v25.5.2 (Pre-Release)
_Released on May 7, 2025_

### [PRO] Pragma Editor
PRO users now have access to a experimental PRAGMA editor. It is located in a new tab in the sidebar.

### Changes
- Changed icons in datetime text input to match icons in cells
- Changed rendering of datetime values to omit the `T` in the UI (export not affected)

### Fixes
- [PRO] Fixed an issue that caused an extra entry on the undo history when an SQLite error occurred during an operation
- [PRO] Fixed a memory leak related to event listeners

## v25.5.0 (Pre-Release)
_Released on May 2, 2025_

- Labels inside sidebar will now overflow more gracefully when running low on horizontal space
- Fixed a potential issue during file opening
- Updated and changed dependencies

## v25.4.3 (Pre-Release)
_Released on April 28, 2025_

Fixed a potential issue during file opening

## v25.4.2 (Pre-Release)
_Released on April 28, 2025_

### [PRO] Improved Logging
The Log has moved to VS Code's Output tab. This enables syntax highlighting, search, filtering, and also improves logging performance.

- Clicking the Log tab in the sidebar now opens VS Code's Output pane with the SQLite Viewer log pre-selected
- Added `[read]` and `[WRITE]` to all log lines, making it easier to scan for unsaved edits, both visually and when using the UI filter
- Added `[${filename}]` to all log lines. This allows you to use the quick filter to limit the output to specific files

### [PRO] Basic Batch Updates
Added basic multi-select and batch editing. When selecting two or more rows, the sidebar now shows the number of distinct values in the selection, or the single common value. 
Changing a value in the sidebar will apply it to all selected rows. 
For now, this is limited to fixed values. 
Hopefully, more functionality from SQLite's `SET` statement can be surfaced in a future update.

### Fixes
- [PRO] Fixed a bug that caused the extension to hang after encountering certain SQLite errors, such as foreign key mismatches
- [PRO] Fixed the UI not updating when reverting unsaved changes through VS Code
- Fixed a bug when using `\` in search terms
- Fixed a bug related to `'` and `"` in column names
- Added missing translations

## v25.4.1 (Pre-Release)
_Released on April 23, 2025_

- [PRO] Improved support for read-only mode. When opening a database file without the required file permissions, the editor will open in read-only mode instead of showing an error, and the UI will indicate that the file has been opened in read-only mode.
- [PRO] When applying unsaved changes to a database file that has been locked by another process (e.g. VS Code has been forcefully shut down), the viewer will now open in read-only mode instead of showing an error. Saving the changes is not possible in read-only mode, so they can be retried at a later time. Be aware that VS Code may prompt you to revert the changes.
- [PRO] Added a read-only SQLite Viewer option to VS Code's "Open With…" dialog.
- If an error occurs while opening a file, it will now be surfaced earlier through VS Code's UI instead of being displayed inside an empty SQLite Viewer tab.
- [PRO] If an error occurs while opening a file, the extension will attempt to use the read-only WebAssembly implementation to open the file instead of failing immediately. A warning will still be displayed in this case.

## v25.4.0 (Pre-Release)
_Released on April 19, 2025_

### [PRO] Date/Time Support
Columns that are defined as either `DATE` or `DATETIME` and have structured data in them are now shown as formatted dates. Supported formats are:
- SQLite ISO-like strings
- ISO-8601 strings
- Julian Day numbers
- Seconds since 1970
- Milliseconds since 1970
- Microseconds since 1970
- Excel serial date (1900 system)
- Windows FILETIME since 1601
- .NET Ticks since 0001

If a valid date is recognized, it can be shown in one of 4 formats:
- Localized, human-readable strings (default)
- Localized, human-readable time-ago strings (e.g. "6 months ago") 
- Machine-friendly ISO-8601 strings
- Raw values

Values can be edited, either through a generic date picker or modifying the interpreted ISO string. The extension will write the original format to disk if it was recognized correctly, or manually selected in the UI.

This feature also integrates with the export feature. E.g. when viewing a column as raw dates, they will be included as raw values in the export. This matches the current export behavior. 
When exporting to JSON, dates will generally be included as ISO strings, unless raw is selected.
When exporting to human-readable formats like Markdown and HTML, the output will generally match what's on screen.
When viewing a column in machine-friendly format and exporting for Excel, the dates will be included in Excel's serial date format. 

### [PRO] Exports
- Renamed the default export format from "TSV" to "Excel" to better reflect its intended purpose
- Changed HTML export to also populate the `text/html` MIME type in the clipboard. This can help pasting structured content into some applications. The old TSV export also made use of this behavior.
- Added a plain "TSV" export format
- Boolean columns are now exported as `true`/`false` when picking CSV, TSV, JSON as export format
- Boolean columns are now exported as `TRUE`/`FALSE` when picking Excel as export format
- `JSONB` columns are now exported as `jsonb('...')` when picking SQLite as export format
- `NULL` values are now omitted when exporting to Excel, CSV, TSV, HTML, or Markdown instead of being included as "NULL" strings 

### Additions
- `JSONB` values are now rendered correctly regardless of column type
- [PRO] `JSONB` values can now be edited regardless of column type
- Small `BLOB` values (<= 48 bytes) are now rendered as hexadecimal in text inputs
- [PRO] Small `BLOB` values can now be inserted and updated in hexadecimal from within the extension. Common formats like UUIDs and IPv6 addresses can be pasted directly into the text field.

### Fixes
- Various improvements to translations 
- [PRO] Fixed lost precision when viewing integers above 2^53 - 1 and below -(2^53 - 1)
- [PRO] Fixed potential issue when inserting or updating values in tables that have special characters in the name
- Fixed a crash caused by an incorrect call to `setValidity`
- Fixed incorrect hover tooltip for `ROWID`
- Arrow icons in column type labels now look identical across platforms
- Fixed hex size cutoff mismatch between UI (48) and exports (32)

## March 2025
This extension is now published using Calendar Versioning of shape: `YY.MM.MICRO`. Using SemVer for a UI client never made much sense, nor was there a clear cutoff when this extension went from 0 to 1. Going forward, all versions will be a date + incremental number.

## v25.3.1 (Pre-Release)
_Released on March 23, 2025_

### Better Dynamic Typing Support
The viewer will now better differentiate between column types (as defined by `CREATE TABLE`) and the actual types of individual values. 
The labels in the detail view have been updated to indicate this. 
For example, when a `TEXT` value was inserted in a `BLOB` column, the label will be `TEXT→BLOB` instead of just `BLOB`.

### Basic `JSONB` Support
- Values in `JSONB` columns are now rendered in their textual representation instead of downloadable blobs
- [PRO] Values inserted or updated in `JSONB` columns are now automatically wrapped in `jsonb(?)`

### Other
- Reduced cutoff for rendering `BLOB` columns in hex format from 256 to 48 bytes 
- Download button in cells is now always aligned left
- Size in bytes is now displayed even when showing a preview image in a cell
- Now always showing the total number of rows alongside the number of filtered rows
- `BLOB` columns with `NULL` values now show a prominent 'NULL' label in the detail view
- Added some missing translations
- Fixed a bug that caused the file size shown on the download button in the detail view to be incorrect
- Changed storage size calculation and labels to match the user's OS:
  - On Windows it will use multiples of 1024 and KB, MB, etc. labels (unchanged) 
  - On macOS it will use multiples of 1000 with KB, MB, etc. labels
  - Others will use multiples of 1024 with KiB, MiB, etc. labels

## v25.3.0 (Pre-Release)
_Released on March 15, 2025_

- Tables are now always explicitly sorted by `ROWID` unless a user-sorting is defined. Tables without `ROWID`s are now always explicitly sorted by their primary keys (in order).
- `ROWID` is now always used as a tie-breaker when sorting by a column that contains duplicate values to ensure a unique ordering. Tables without `ROWID` now always use their primary keys (in order) as tie-breakers.
- Fixed a bug that caused shift-select to fail for certain orderings with duplicate values (see above).
- Scroll bars of text fields are now thinner
- Changed frontend bundler from Rollup to esbuild

## v0.10
### Localization 🇩🇪 🇫🇷 🇧🇷 🇯🇵 🇪🇸 🇰🇷
This extension now includes translations for German, French, Portuguese (Brazil), Japanese, Spanish and Korean.
If your VS Code display language is set to one of these, the extension will adjust automatically. 
You can change your VS Code display language from the Command Palette using "Configure Display Language".

## v0.10.5
_Released on March 12, 2025_

Fixed an issue that prevented the editor from opening in the latest VS Code preview build.

## v0.10.4 (Pre-Release)
_Released on March 11, 2025_

Retrying previous release

## v0.10.3 (Pre-Release)
_Released on March 11, 2025_

- Fixed an issue that caused ordering of exported rows to match the selection order rather than ordering in the UI
- Updated SQLite to 3.49.1
- Updated many internal dependencies
- [PRO] The toolchain to compile the native helper was updated from Zig 0.13 to 0.14

## v0.10.2
_Released on February 14, 2025_

- Added missing labels to some UI elements
- Changed wording of some labels
- Fixed an issue that caused minor layout shift when hiding columns

## v0.10.1
_Released on February 11, 2025_

Added Japanese, Spanish and Korean translations.

## v0.10.0
_Released on February 8, 2025_

Added German, French and Portuguese translations.

## v0.9
### Features
- [PRO] You can now change values in `BLOB` columns through a new file input field in the modal and sidebar
- [PRO] Added a button to set a `BLOB` value to `NULL` in the modal and sidebar

### Changes
- Image previews are now only fetched from the db when they are visible in the viewport

### Fixes
- Added a small amount of buffering that prevents many stale and unnecessary queries from being run. This should also prevent freezes and excessive load times in some cases
- Fixed a bug that caused image previews to not update when refreshing the table
- Disabled row count caching, which could cause incorrect row numbers to be displayed in some cases.
- Fixed a bug that prevented input fields in the modal from being auto-focused and scrolled into view in the sidebar if the cell value was empty
- [PRO] Should now call `sqlite3_close` correctly when closing a tab
- Fixed drop effect being shown incorrectly when dragging a column
- Fixed "exact" filter modifier not working

## v0.9.6
_Released on January 10, 2025_

- SQLite Viewer now remembers the last sidebar position
- Fixed row selection background color when explorer panel loses focus

## v0.9.5
_Released on November 22, 2024_

- [PRO] Fixed token auto-renewal after 14 days
- [PRO] Added timeout to token auto-renewal
- Fixed insert row number appearing in wrong position when pinning columns
- Improved scrollbar placement for Table Info table creation SQL textarea

## v0.9.4
_Released on November 18, 2024_

- Fixed Table Info tab missing horizontal scroll overflow
- Added formatting to Table Info table creation SQL  
- Changed table creation SQL to use textarea instead of inline text
- Updated dependencies

## v0.9.3
_Released on November 10, 2024_

- Fixed column drag and drop using the sidebar
- Fixed height of pinned rows

## v0.9.2
_Released on November 7, 2024_

- [PRO] Added Markdown export
- [PRO] Adding `<br>` for newlines when exporting as HTML or Markdown
- [PRO] JSON columns are rendered as code blocks when exporting as HTML or Markdown

## v0.9.1
_Released on November 6, 2024_

- Bumped SQLite to 3.47.0
- Bumped SQLite WASM to 3.47.0
- Reverted Ctrl+C change
- Mixed up ad placement

## v0.9.0
_Released on November 1, 2024_

Initial v0.9 release

## v0.8
### [SQLite Viewer PRO](https://vscode.sqliteviewer.app)
You can now upgrade SQLite Viewer to a read-write database editor by upgrading to SQLite Viewer PRO. 
Like the base version, it's designed to *just work*, even in remote workspaces like WSL, SSH, and containers. For more information check out [vscode.sqliteviewer.app](https://vscode.sqliteviewer.app) or the info popup inside the viewer. 
Users of the free version are not affected by this.

### Secondary Sidebar
SQLite Viewer now features a second sidebar 🎉. It shows either the current row selection or metadata about the current table.

## v0.8.9
- Improved experience for first-time users of the extension
- Fixed a bug that caused files without extensions to not open when placed inside an invisible folder

## v0.8.8
_Released on October 30, 2024_

- [PRO] Changed license key validation to support keys from different payment providers
- [PRO] Added copy to clipboard option to offline activation wizard

## v0.8.7
_Released on October 26, 2024_

- [PRO] Renamed "Enter Access Token" command to "Offline License Activation" and changed workflow to a guided wizard with additional instructions.

## v0.8.6
_Released on October 22, 2024_

- [PRO] Added "Enter Access Token" command that allows activating the PRO version while offline or behind a firewall. 

## v0.8.5
_Released on October 22, 2024_

### Features
- [PRO] Added basic logging to the sidebar for better insight into what SQLite Viewer is doing behind the scenes.

### Fixes
- [PRO] Fixed a bug that caused a SQLite transaction to be started before making any changes
- [PRO] Fixed a bug that caused unsaved edits to be lost when closing and reopening VSCode 2+ times
- Fixed some unnecessary queries being run 

## v0.8.4
_Released on October 20, 2024_

- [PRO] Made error messages more descriptive
- [PRO] Added a confirmation dialog before committing a transaction that contains too many changes to keep in the undo history. This usually occurs when deleting large numbers of rows.
- Fixed a bug that reset range selection when using pagination buttons or the scrollbar
- Other minor fixes

## v0.8.3
_Released on October 18, 2024_

Minor fixes. Bumped to main release channel.

## v0.8.2 (Pre-Release)
_Released on October 18, 2024_

No outside visible changes

## v0.8.1 (Pre-Release)
_Released on October 17, 2024_

[PRO] Performance improvements

## v0.8.0 (Pre-Release)
_Released on October 17, 2024_

Initial 0.8 release

## v0.7.3
_Released on September 29, 2024_

- The initial size of the sidebar is now based on available space
- Resizing the sidebar and columns should now work when using the extension with a web-based version of VSCode on an iPad or other touch device
- Row buttons no longer take up space while the row is not in the hovered state
- Various bug fixes and improvements

## v0.7.2
_Released on September 28, 2024_

Fixed telemetry connection string error

## v0.7.1
_Released on September 28, 2024_

Fixed version update banner from being shown again

## v0.7.0
_Released on September 28, 2024_

- Added basic keyboard navigation support. It is still quite easy to lose the focus, especially when using Page Up/Page Down keys.
- Added button to collapse the sidebar
- Various minor fixes and improvements
- Added expand/collapse all button to tables sidebar
- It is now possible to __open more than one SQLite Viewer instance per file__. 
  Additionally, opening large files (~1GB) is now much faster, and opening additional tabs of the same file carries little additional cost.

Note that this release includes significant restructuring of the extension, which may cause (unrelated) issues.
Please [report](https://github.com/qwtel/sqlite-viewer-vscode/issues) any issues you encounter. 

## v0.6 (Pre-Release)
### Secondary Sidebar
~~SQLite Viewer now features a second sidebar 🎉. It shows either the current row selection or metadata about the current table.~~
This has been shelved for now, please remain on the pre-release channel if you need the sidebar.

## v0.6.7 (Pre-Release)
_Released on September 24, 2024_

Code refactoring, no externally visible changes 

## v0.6.6 (Pre-Release)
_Released on September 9, 2024_

Replaced 3rd party ad with 1st party ad: Check out [Hydejack](https://hydejack.com/?ref=vscode), a Jekyll theme for hackers, nerds, and academics, made by yours truly.

## v0.6.5 (Pre-Release)
_Released on August 28, 2024_

Code refactoring, no externally visible changes 

## v0.6.4 (Pre-Release)
_Released on July 10, 2024_

It is now possible to __open more than one SQLite Viewer instance per file__. 
Additionally, opening large files (~1GB) is now much faster, and opening additional tabs of the same file carries no additional cost beyond the webview itself. 

## v0.6.3 (Pre-Release)
_Released on July 1, 2024_

Included latest changes from 0.5 branch
 
## v0.6.2 (Pre-Release)
_Released on June 18, 2024_

- Improved keyboard support. Page Up/Page Down should now work in most cases
- Added expand/collapse all button to tables sidebar
- Fixed a performance regression when rendering a table for the first time

## v0.6.1 (Pre-Release)
_Released on June 17, 2024_

Added basic keyboard support to table explorer and main view

## v0.5
### WAL Mode Support
This version introduces support for __reading WAL mode databases__. It works across all VSCode file systems including local, remote, and even on github.dev.

This fixes a common issue that caused the contents of a `-wal` file not being shown in the UI when the auto checkpoint limit hadn't been reached.
This led to unsatisfying workarounds such as disabling WAL mode, triggering checkpoints manually or reducing the auto checkpoint limit.

While this update removes the need for the above workarounds, it does not change the read-only nature of the extension or remove the need to reload the file for updates to be visible in the UI.

Note that making this work required significant restructuring of the extension, which may cause (unrelated) issues. Please report any you may encounter. 

## v0.5.13
_Released on May 19, 2024_

- Replaced 3rd party ad with 1st party ad: Check out [Hydejack](https://hydejack.com/?ref=vscode), a Jekyll theme for hackers, nerds, and academics, made by yours truly.

## v0.5.12
_Released on May 19, 2024_

- Fixed an issue related to square brackets in column names

## v0.5.11
_Released on May 19, 2024_

- Fixed an issue that caused the update notification to re-appear each time VSCode was restarted

## v0.5.10
_Released on May 19, 2024_

- Fixed an issue that caused an entire file to crash when some tables/views are using custom functions
- Fixed an issue that caused rendering artifacts and column resizing issues in empty tables

## v0.5.9
_Released on July 1, 2024_

Improved column filtering:
- Added a button to invert a column filter
- Added a button to filter a column for non-nullish (`NULL` or empty string) values. You can combine it with the invert button to filter for nullish values instead.
- Typing `NULL` or `''` into the column filter will now filter by null or empty string values respectively.
- Changed representation of empty strings from `""` to `''`. This is to match the filter values above and to distinguish it from the legitimate search target `""`, which can come up in combination with JSON/B columns. If you need to search for the exact string sequence `''`, use escape characters: `\'\'`.
- Fixed a bug that caused column filters to not properly reset when deleting the contents of the search box

Experimental support for Views:
- SQLite Viewer can now view Views. Note that there is a known performance issue for large views. This feature will retain the "Experimental" qualifier until I can resolve it.
- Added button to expand/collapse all tables and views in the sidebar

## v0.5.8
_Released on June 11, 2024_

- Limiting webview Content Security Policy to environments that are known to work.
This should (finally) make this extension work with GitPod and Google IDX.
- Fixed download button height in detail view 
- Reduced bundle size (< 1MB)

## v0.5.7
_Released on June 10, 2024_

The extension now adds configuration settings for nesting SQLite-related files:

![File nesting screenshot](documentation/nesting.png)

This has no effect if you aren't using VSCode's File Nesting feature. You may enable it in settings under "Explorer > File Nesting: Enabled".

If you use file nesting, but do not want to nest SQLite files, you can manually delete the patterns from the settings page under "Explorer > File Nesting: Patterns". SQLite Viewer will not attempt to set the patterns again, unless explicitly requested through the command "SQLite Viewer: Add SQLite File Nesting Patterns".

This version also changes the file name of downloaded blobs to be prefixed with `-x-`, e.g. `favicons.sqlite-x-moz_icons-10-data.bin`. This ensures that downloaded blobs will be sorted below `-wal`, `-shm` and `-journal` files, reducing the risk of accidentally interacting with them when range-selecting downloaded files.

### Fixes
- Downgraded minimum vscode version to 1.83.1. This should make the Open VSX version of the extension work with Google IDX
- Removed special characters from codicons asset path. This should make icons render correctly when using the Open VSX version of the extension in GitPod
- Fixed an error when setting max file size to 0

## v0.5.6
_Released on June 1, 2024_

Fixed a potential memory issue by limiting memory usage to configured file size limit

## v0.5.5
_Released on June 1, 2024_

Bumped WAL Mode support to main channel.

### Changes
- Autofocus in detail view should now work when the query takes longer to finish
- Added better loading indicator to detail view
- Minor performance improvement for detail view query

## v0.5.4 (Pre-Release)
_Released on May 23, 2024_

- Generated columns are now shown
- Fixed showing `ROWID` column for tables that were created without row ids

## v0.5.3 (Pre-Release)
_Released on May 22, 2024_

Fixed an issue that prevented the extension from loading on github.dev in Safari

## v0.5.2 (Pre-Release)
_Released on May 21, 2024_

Added Content-Security-Policy to extension webview

## v0.5.1 (Pre-Release)
_Released on May 19, 2024_

No publicly visible changes

## v0.5.0 (Pre-Release)
_Released on May 18, 2024_

Initial v0.5 pre-release

## v0.4
### Solid Rewrite
SQLite Viewer 0.4 is a complete rewrite of this extension with a focus on improved performance.

It also implements SQLite Viewer's **most requested feature**: Default file association for `.db` files! 

Additionally, version 0.4 ships many quality of life improvements:

- Double clicking a cell will now open the modal and pre-select the text content
- The extension will now attempt to auto-size text columns based on visible content on first open
- Blob columns containing known image formats are previewed inline
- Blob columns up to 256 bytes (that aren't images) are rendered in hex format instead of as a download button
- Pinning a row will no longer remove it from the main view
- Columns can now be hidden in the sidebar
- The `ROWID` column can now be displayed (enable in sidebar)
- It is now possible to select and rearrange multiple columns at the same time in the sidebar
- The modal/dialog view can now be resized
- Downloading a blob will now automatically add an appropriate file extension if it can be inferred
- Column sizes and pinning now persist when switching to another table (but not after closing the tab/file) 

### Performance
- Faster virtualized scrolling
- Faster columns resizing

### Style
- Many aspects of the extension's UI should match VSCode's style closer

## v0.4.14
_Released on April 30, 2024_

- Generated columns are now shown
- Fixed showing `ROWID` column for tables that are created without a `ROWID`
- Fixed an issue that prevented the extension from loading on github.dev in Safari

## v0.4.12 – v0.4.13
_Released on April 30, 2024_

Fixed an issue that prevented text selection when using the extension on the web in the latest version of Chrome

## v0.4.11
_Released on April 30, 2024_

- Tables in sidebar are now sorted alphabetically 
- Fixed foreign key icon not being shown, or being shown on wrong column 
- Fixed text in foreign key tooltip referencing wrong column names 

## v0.4.10
_Released on April 30, 2024_

- SQLite updated to 3.45.3
- Fixed an issue that sometimes caused text selection to be slow

## v0.4.9
_Released on May 6, 2024_

Fixed an issue that prevented files from loading correctly when connected to a workspace via SSH

## v0.4.8
_Released on May 6, 2024_

- The detail view has a new, cleaner look that closer matches similar components in VSCode
- Added extension name and version number to the bottom left

## v0.4.7
_Released on May 4, 2024_

- Fixed visible cells updating to new values immediately after refreshing a file
- Fixed an issue that caused the UI to become non-interactive when showing an error message

## v0.4.6
_Released on May 4, 2024_

- Added button to filter columns by exact search term
- Removed "Not Allowed" cursor from read-only fields in detail view
- Improved startup time by avoiding unnecessary copying when opening a file

## v0.4.5
_Released on May 3, 2024_

Fixed an issue that caused the extension to go blank when opening an external link

## v0.4.4
_Released on May 3, 2024_

### Features
Improved JSON column support
- JSON columns are now shown as textarea instead of a one-line input in detail view
- JSON textarea defaults to 6 rows instead of 2 in detail view
- JSON values are now rendered in monospace font
- JSON values are now pretty printed in detail view

### Fixes
- Unknown column types now default to textarea instead of one-line input

### Style
- Better differentiation between empty strings and NULL by showing them as `""` instead of `NULL`

## v0.4.3
_Released on May 2, 2024_

### Fixes
- Added back search functionality for tables
- Fixed ROWID column sizing
- Fixed a browser history issue when using the extension on the web

## v0.4.2
_Released on May 1, 2024_

### Fixes
- Fixed column widths resetting when refreshing a file
- Fixed column order resetting when refreshing a file
- Fixed an issue causing the grid to collapse when refreshing a file
- Fixed sidebar column order not updating when pinning a column
### Style
- Increased default column width by 20%

## v0.4.1
_Released on April 30, 2024_

Added essential application reporting

## v0.4.0
_Released on April 30, 2024_

Initial v0.4 release

## v0.3.0 – v3.0.24
_Released on May 25, 2023_

Minor bug fixes and previews 

## v0.2.4
_Released on April 11, 2023_

- Added max file size setting

## v0.2.3
_Released on March 4, 2023_

- Fixed opening FTS4 & FTS5 files
- Fixed showing large integers
- Fixed showing booleans
- Fixed opening files exported by pandas `.to_sql`

## v0.2.2
_Released on March 3, 2023_

Prerelease version

## v0.2.1
_Released on March 2, 2023_

Prerelease version

## v0.2.0
_Released on March 21, 2022_

Prerelease version

## v0.1.5
_Released on February 23, 2022_

* Fixed a bug that caused the SQLite WebWorker to be initialized twice
* Updated dependencies
  * Updated SQLite to 3.38.0

## v0.1.4
_Released on January 24, 2022_

* Updated dependencies
  * Updated SQLite to 3.37.2
  * Updated React v18 to latest Release Candidate

## v0.1.3
_Released on December 16, 2021_

* Added ref to external link

## v0.1.2
_Released on December 15, 2021_

### Fixes
* Opening files with the R*Tree extension will no longer produce an error
* Binary values are now always rendered as download buttons, even when not specified as `BLOB` type

### Other
* Updated dependencies
  * Updated React to v18 Release Candidate

## v0.1.1
_Released on December 13, 2021_

### Fixes
* Show error message when trying to open SQLite file using extensions

## v0.1.0
_Released on November 28, 2021_

You can now open any file with SQLite Viewer and set SQLite Viewer as default for any file extension:

![Open With](documentation/new.gif)

### Changes
* Removed the `.db` file association, as it is too generic to be permanently associated with SQLite Viewer. 
You can easily restore the old behavior through VSCode's Open With menu.
* Updated dependencies
  * Updated React to v18 Beta
  * Updated React Router to v6

### Fixes
* Fixed a transparency issue with fixed columns with certain color themes

## v0.0.1 – v0.0.24
* Replaced Emojis with Codicons for better VSCode integration
* Added support for pinning columns and rows
* Added reload button 
* Column virtualization: Tables with many columns should no longer impact UI performance
* Added keyboard shortcuts
  - Ctrl+F/Cmd+F: Focus global search
  - Ctrl+R/Cmd+R: Reload content
