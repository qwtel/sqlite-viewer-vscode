/// <reference types="bun-types" />

import { $ } from "bun";
import fs from 'node:fs/promises';
import { parseArgs } from "node:util";

import URL from 'url';
import path from 'path'

const __filename = URL.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolve = (...args: string[]) => path.resolve(__dirname, ...args);

const DEV = !!Bun.env.DEV;
console.log({ DEV })

const matrix = [
  "win32-x64",
  "win32-arm64",
  "linux-x64",
  "linux-arm64",
  // "linux-armhf",
  "alpine-x64",
  "alpine-arm64",
  "darwin-x64",
  "darwin-arm64",
  // "web",
] as const;

const targetToZigTriple = {
  "win32-x64": "x86_64-windows",
  "win32-arm64" : "aarch64-windows",
  "linux-x64" : "x86_64-linux-gnu",
  "linux-arm64" : "aarch64-linux-gnu",
  // "linux-armhf" : "",
  "alpine-x64" : "x86_64-linux-musl",
  "alpine-arm64" : "aarch64-linux-musl",
  "darwin-x64" : "x86_64-macos",
  "darwin-arm64" : "aarch64-macos",
  // "web" : "",
};

const outDir = resolve('out')
const tmpDir = resolve('tmp')

export const compileBin = async () => {
  let _target = Bun.env.VSCODE_EXT_TARGET
  if (_target && !(matrix.includes(_target as any))) {
    throw new Error(`Invalid target: ${_target}. Must be one of: ${matrix.join(', ')}`);
  }
  if (!_target) {
    console.warn("Assuming target: darwin-arm64");
    _target = "darwin-arm64"; // FIXME: make host platform
  }

  const target = _target as typeof matrix[number];

  const inFile = path.resolve(tmpDir, 'bundle.js');
  const outFile = path.resolve(outDir, 'bin', 'sqlite_viewer_helper');

  await fs.unlink(outFile).catch(() => {});
  await fs.mkdir(path.resolve(outDir, 'bin'), { recursive: true });

  if (!Bun.env.TJS_ZIG_OUT) throw new Error('TJS_ZIG_OUT not set');

  const exe$ = target.includes('win32') ? '.exe' : '';
  const exePath = path.join(Bun.env.TJS_ZIG_OUT, targetToZigTriple[target], 'tjs' + exe$);
  console.log({
    exePath, 
    inFile, 
    outFile
  })
  await $`tjs compile -x ${exePath} ${inFile} ${outFile + exe$}`;
};

if (import.meta.main) {
  await compileBin().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
