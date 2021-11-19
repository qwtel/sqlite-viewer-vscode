# SQLite Viewer for VSCode

A quick and easy SQLite viewer for VSCode, inspired by DBBrowser for SQLite and Airtable.

![Sqlite Viewer Demo](documentation/demo.gif)

<br/>

## [🆕 Try Out the Standalone Web App](https://sqliteviewer.app)

You can now use this extension as a standalone web app at <https://sqliteviewer.app>.

Inspect sqlite files from any machine, no installation or file upload required.

## Features
- Platform-independent, no native dependencies — now working on VSCode for Web
- File extension association: Just click on a `.sqlite` file and the custom editor opens
- Fast UI with virtualized scrolling, sorting, filtering, etc.
- Seamlessly integrates with VSCode and matches your color theme

## Caveats
- Cached and Readonly
- Only works for files that fit in system memory
- No query runner
- Requires uncorrupted files, i.e. `-journal` and `-wal` files are ignored

## What's New?
* Replaced Emojis with Codicons for better VSCode integration
* Added support for pinning columns and rows
* Added reload button 
* Column virtualization: Tables with many columns should only mildly impact UI performance
* Added keyboard shortcuts
  - Ctrl+F/Cmd+F: Focus global search
  - Ctrl+R/Cmd+R: Reload content
