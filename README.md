# SQLite Viewer for VSCode

A quick and easy SQLite viewer for VSCode, inspired by DB Browser for SQLite and Airtable.

![Sqlite Viewer Demo](documentation/demo.gif)

<br/>

## Features
- Platform-independent, no native dependencies — now working on VSCode for Web
- File extension association: Just click on a `.sqlite` file and the custom viewer opens
- Fast UI with virtualized scrolling, sorting, filtering, etc.
- Seamlessly integrates with VSCode and matches your color theme

## Caveats
- Cached and Readonly
- Only works for files that fit in system memory
- No query runner
- Requires uncorrupted files, i.e. `-journal` and `-wal` files are ignored

<br/>

## [Try Out the Standalone Web App][ref]

You can now use this extension as a standalone web app at [sqliteviewer.app][ref].

Inspect `.sqlite` files from any machine, no installation or file upload required.

[ref]: https://sqliteviewer.app
