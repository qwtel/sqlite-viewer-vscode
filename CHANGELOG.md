# CHANGELOG

## v0.2.4
- Added max file size setting

## v0.2.3
- Fixed opening FTS4 & FTS5 files
- Fixed showing large integers
- Fixed showing booleans
- Fixed opening files exported by pandas `.to_sql`

## v0.2.2
Prerelease version

## v0.2.1
Prerelease version

## v0.2.0
Prerelease version

## v0.1.5
* Fixed a bug that caused the SQLite WebWorker to be initialized twice
* Updated dependencies
  * Updated SQLite to 3.38.0

## v0.1.4
* Updated dependencies
  * Updated SQLite to 3.37.2
  * Updated React v18 to latest Release Candidate

## v0.1.3
* Added ref to external link

## v0.1.2
### Fixes
* Opening files with the R*Tree extension will no longer produce an error
* Binary values are now always rendered as download buttons, even when not specified as `BLOB` type

### Other
* Updated dependencies
  * Updated React to v18 Release Candidate

## v0.1.1
### Fixes
* Show error message when trying to open SQLite file using extensions

## v0.1.0
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
