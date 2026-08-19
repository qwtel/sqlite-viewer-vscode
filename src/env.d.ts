interface ImportMetaEnv {
  DEV: boolean
  VITE_VSCODE: boolean
  VSCODE_BROWSER_EXT: boolean
  VSCODE_PRE_RELEASE: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
