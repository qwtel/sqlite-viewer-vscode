# SQLite Viewer for VSCode

A quick and easy SQLite viewer for VSCode, inspired by DBBrowser for SQLite and Airtable.

![Sqlite Viewer Demo](documentation/demo.gif)

<br/>

## 🚧 Feedback Welcome 🚧
This tool has been my passion project over the last couple of weeks — which I hope it shows — and I'm open to feedback and suggestions.

It mostly works for what I had in mind, which is to peek into SQLite files without leaving VSCode, but how are you using it?  

Since I've been contemplating the following features, would you consider any these useful: Pivot Tables/Group By, Advanced Filter Builder, 1-Click Joins, Row Selection + JSON/CSV/XML Exporting? 

Are any of the caveats listed below dealbreakers?

You can leave public feedback [on GitHub](https://github.com/qwtel/sqlite-viewer-vscode/discussions) or contact me privately [via mail](mailto:mail@qwtel.com).


### Features
- Platform-independent, no native dependencies — now working on VSCode for Web
- File extension association: Just click on a `.sqlite` file and the custom editor opens
- Fast UI with virtualized scrolling, sorting, filtering, etc.
- Seamlessly integrates with VSCode and matches your color theme

### Caveats
- Readonly
- Only works for SQLite files that fit in memory[^1]
- No freeform SQL queries
- Requires uncorrupted files, i.e. `-journal` and `-wal` files are ignored

[^1]: Files are kept in memory, same as other files in VSCode. Accessing SQLite files in the canonical way, i.e. reading from disk, could be done but it would require eschewing VSCode's `workspace.fs`, which doesn't support random access (or operations like `fsync` for that matter), as well as recompiling SQLite with Emscripten's `NODEFS` File System API or implementing a custom SQLite VFS. I've deemed this effort unreasonable for the use-case I had in mind.