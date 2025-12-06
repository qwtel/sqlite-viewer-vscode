if (!('dispose' in Symbol)) {
  Object.defineProperty(Symbol, 'dispose', { value: (Symbol as typeof globalThis.Symbol).for('Symbol.dispose') });
}

if (!('asyncDispose' in Symbol)) {
  Object.defineProperty(Symbol, 'asyncDispose', { value: (Symbol as typeof globalThis.Symbol).for('Symbol.asyncDispose') });
}

if (!('throwIfAborted' in AbortSignal.prototype)) {
  Object.defineProperty(AbortSignal.prototype, 'throwIfAborted', {
    value: function(this: AbortSignal) {
      if (this.aborted) {
        throw new DOMException(`AbortError: ${this.reason}`, 'AbortError');
      }
    }
  });
}

if (!('withResolvers' in Promise)) {
  Object.defineProperty(Promise, 'withResolvers', {
    value: <T>() => {
      let resolve, reject;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }
  });
}

export {};
