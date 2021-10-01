# SQLite Viewer for VSCode

A quick and easy SQLite viewer for VSCode

![Paw draw editor ](media/demo.gif)

Features:
- Platform-independent, no native dependencies
- File extension association: Just click on a `.sqlite` file and the custom editor opens
- Fast UI with infinite scroll, sorting, filtering, etc.
- Seamlessly integrates with VSCode and matches your color theme. 

Caveats:
- Readonly
- Only works for "small" sqlite files, as everything is kept in memory[^1]

[^1]: Accessing SQLite files in the canonical way, i.e. reading from disk rather than memory, from within VSCode could be done, but it would require eschewing VSCode's own `workspace.fs`, since it doesn't support random access within files (or operations like `fsync` for that matter), as well as  recompiling SQLite with Emscripten's `NODEFS` File System API or a custom SQLite VFS.  