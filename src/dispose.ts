import * as vscode from 'vscode';

export function disposeAll(disposables: vscode.Disposable[]): void {
  while (disposables.length) {
    const item = disposables.pop();
    item?.dispose();
  }
}

export abstract class Disposable implements vscode.Disposable {
  #isDisposed = false;

  #disposables: vscode.Disposable[] = [];

  dispose(): any {
    if (this.#isDisposed) {
      return;
    }
    this.#isDisposed = true;
    disposeAll(this.#disposables);
  }

  [Symbol.dispose]() {
    return this.dispose();
  }

  protected _register<T extends vscode.Disposable>(value: T): T {
    if (this.#isDisposed) {
      value.dispose();
    } else {
      this.#disposables.push(value);
    }
    return value;
  }

  protected get isDisposed(): boolean {
    return this.#isDisposed;
  }
}