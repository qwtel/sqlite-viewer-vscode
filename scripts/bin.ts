/// <reference types="bun-types" />

import { $ } from "bun";
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';

import URL from 'url';
import path from 'path'

import { ProcessTitle } from "../src/constants";

const __filename = URL.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolve = (...args: string[]) => path.resolve(__dirname, '..', ...args);

const DEV = !!Bun.env.DEV;
console.log({ DEV })

const targets = [
  "win32-x64",
  "win32-arm64",
  "linux-x64",
  "linux-arm64",
  "linux-armhf",
  "alpine-x64",
  "alpine-arm64",
  "darwin-x64",
  "darwin-arm64",
  "web",
] as const;

const targetToZigTriple: Record<BuildTarget, string> = Object.freeze({
  "win32-x64": "x86_64-windows",
  "win32-arm64" : "aarch64-windows",
  "linux-x64" : "x86_64-linux-gnu",
  "linux-arm64" : "aarch64-linux-gnu",
  "linux-armhf" : "arm-linux-gnueabihf",
  "alpine-x64" : "x86_64-linux-musl",
  "alpine-arm64" : "aarch64-linux-musl",
  "darwin-x64" : "x86_64-macos",
  "darwin-arm64" : "aarch64-macos",
});

const outDir = resolve('out')
const tmpDir = resolve('.tmp')

export const compileBin = async (targetArg?: string) => {
  const hostTarget = detectHostTarget();

  if (targetArg && !(targets.includes(targetArg as any))) {
    throw new Error(`Invalid target: ${targetArg}. Must be one of: ${targets.join(', ')}`);
  }
  if (!targetArg) {
    console.warn(`Assuming target: ${hostTarget}`);
    targetArg = hostTarget;
  }

  const target = targetArg as typeof targets[number];
  console.log({ target })

  const ext = target.startsWith('win32') ? '.exe' : '';
  const filename = target.startsWith('win32')
    ? ProcessTitle + ext
    : ProcessTitle.toLowerCase().replaceAll(' ', '-');

  const inFile = path.resolve(tmpDir, 'bundle.js');
  const outBinDir = path.resolve(outDir, 'bin');
  const outBinFile = path.resolve(outBinDir, filename);

  await fs.rmdir(outBinDir, { recursive: true }).catch(() => {});
  await fs.mkdir(outBinDir, { recursive: true });

  if (target === 'web') return;

  const zigOutDir = Bun.env.TJS_ZIG_OUT ?? resolve('zig-build-txiki/zig-out');

  const tjsPath = path.join(zigOutDir, DEV ? 'bin' : targetToZigTriple[hostTarget], 'tjs');
  const exePath = path.join(zigOutDir, DEV ? 'bin' : targetToZigTriple[target], 'tjs' + ext)
      
  console.log({
    exePath, 
    inFile, 
    outFile: outBinFile
  });
  await $`${tjsPath} compile -x ${exePath} ${inFile} ${outBinFile}`;
  console.log(`Compiled binary for target: ${target}`);
};

if (import.meta.main) {
  const target = Bun.env.VSCODE_EXT_TARGET
  await compileBin(target).catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

type BuildTarget = Exclude<typeof targets[number], 'web'>;

function detectHostTarget(): BuildTarget {
  const platform = process.platform;
  const arch = process.arch;
  const isMusl = platform === 'linux' && (existsSync('/etc/alpine-release') || process.env.LIBC === 'musl');

  if (platform === 'darwin') {
    if (arch === 'arm64') return 'darwin-arm64';
    if (arch === 'x64') return 'darwin-x64';
  }
  if (platform === 'win32') {
    if (arch === 'arm64') return 'win32-arm64';
    if (arch === 'x64') return 'win32-x64';
  }
  if (platform === 'linux') {
    if (arch === 'arm') return 'linux-armhf';
    if (arch === 'arm64') return isMusl ? 'alpine-arm64' : 'linux-arm64';
    if (arch === 'x64') return isMusl ? 'alpine-x64' : 'linux-x64';
  }

  throw new Error(`Unsupported host platform: ${platform}-${arch}`);
}
