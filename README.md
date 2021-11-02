# SQLite Viewer for VSCode

A quick and easy SQLite viewer for VSCode, inspired by DBBrowser for SQLite and Airtable.

![Sqlite Viewer Demo](documentation/demo.gif)

<br/>

## 🆕 Try Out the Standalone Web App

You can now use this extension as a standalone web app at <https://sqliteviewer.app>.

Inspect sqlite files from any machine, no installation or upload required.

[SQLite Viewer Web](https://sqliteviewer.app)

<!-- ## 🚧 Feedback Welcome 🚧
This tool has been my passion project over the last couple of weeks — which I hope it shows — and I'm open to feedback and suggestions.

You can leave public feedback [on GitHub](https://github.com/qwtel/sqlite-viewer-vscode/discussions) or contact me privately [via mail](mailto:mail@qwtel.com). -->

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
