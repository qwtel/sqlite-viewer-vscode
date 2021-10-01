# SQLite Viewer for VSCode

A quick and easy SQLite viewer for VSCode

![Sqlite Viewer Demo](https://raw.githubusercontent.com/qwtel/sqlite-viewer-vscode/master/documentation/demo.gif)

## Features
- Platform-independent, no native dependencies
- File extension association: Just click on a `.sqlite` file and the custom editor opens
- Fast UI with infinite scroll, sorting, filtering, etc.
- Seamlessly integrates with VSCode and matches your color theme

## Caveats
- Readonly
- Only works for SQLite files that fit in memory[^1]
- No freeform SQL queries

[^1]: Files are kept in memory, same as other files in VSCode. Accessing SQLite files in the canonical way, i.e. reading from disk, could be done but it would require eschewing VSCode's `workspace.fs`, which doesn't support random access (or operations like `fsync` for that matter), as well as recompiling SQLite with Emscripten's `NODEFS` File System API or implementing a custom SQLite VFS. 