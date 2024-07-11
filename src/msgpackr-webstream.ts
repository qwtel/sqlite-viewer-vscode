// import { TransformStream } from 'node:stream/web';
import { Buffer } from 'buffer';
import { Packr, Unpackr, Options } from 'msgpackr';

import { TransformStream } from './webStream.ts';

export class PackrTransformStream extends TransformStream<any, Uint8Array> {
  constructor(options: Options & { packr?: Packr } = {}) {
    options = { ...options, sequential: true };
    const packr = options.packr || new Packr(options);

    super({
      transform(chunk, controller) {
        controller.enqueue(packr.pack(chunk));
      }
    });
  }
}

export class UnpackrTransformStream extends TransformStream<Uint8Array, any> {
  constructor(options: Options & { unpackr?: Unpackr } = {}) {
    options = { ...options, structures: [] };
    const unpackr = options.unpackr || new Unpackr(options);
    let incompleteBuffer: Uint8Array|null = null;

    super({
      transform(chunk, controller) {
        if (incompleteBuffer) {
          chunk = Buffer.concat([incompleteBuffer, chunk]);
          incompleteBuffer = null;
        }

        let values;
        try {
          values = unpackr.unpackMultiple(chunk);
        } catch (err) {
          const error = err as { incomplete: boolean, lastPosition: number, values: any[] };
          if (error.incomplete) {
            incompleteBuffer = chunk.subarray(error.lastPosition);
            values = error.values;
          } else {
            controller.error(error);
          }
        } finally {
          if (values) {
            for (const value of values) {
              controller.enqueue(value);
            }
          }
        }
      }
    });
  }
}
