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

## [🎀 Looking for Sponsors][ghs]

SQLite Viewer 2 is under active development and looking for sponsors!

If you're benefiting form SQLite Viewer today, consider picking one of the sponsorship tiers on my [GitHub Sponsors Page][ghs].

[![Sponsor](https://img.shields.io/badge/qwtel-GitHub%20Sponsors-ff69b4?style=flat-square)][ghs]

<br/>

## Try Out the Standalone Web App

You can now use this extension as a standalone web app at [sqliteviewer.app][ref].

Inspect `.sqlite` files from any machine, no installation or file upload required.

[ref]: https://sqliteviewer.app
[ghs]: https://github.com/sponsors/qwtel
