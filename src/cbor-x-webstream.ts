import { Encoder, Decoder, Options } from 'cbor-x';

import { TransformStream } from './webStream.ts';

export class CBOREncoderTransformStream extends TransformStream<any, Uint8Array> {
  constructor(options: Options & { encoder?: Encoder } = {}) {
    options = { ...options, sequential: true };
    const encoder = options.encoder || new Encoder(options);

    super({
      async transform(value, controller) {
        try {
          for await (const chunk of (encoder as any).encodeAsAsyncIterable(value)) {
            controller.enqueue(chunk)
          }
        } catch (err) { controller.error(err) }
      }
    });
  }
}

export class CBORDecoderTransformStream extends TransformStream<Uint8Array, any> {
  constructor(options: Options & { decoder?: Decoder } = {}) {
    options = { ...options, structures: [] };
    const decoder = options.decoder || new Decoder(options);
    let incompleteBuffer: Uint8Array|null = null;

    super({
      transform(chunk, controller) {
        if (incompleteBuffer) {
          chunk = concat(incompleteBuffer, chunk);
          incompleteBuffer = null;
        }

        let values;
        try {
          values = decoder.decodeMultiple(chunk);
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

function concat(a: Uint8Array, b: Uint8Array) {
  const result = new Uint8Array(a.length + b.length);
  result.set(a);
  result.set(b, a.length);
  return result;
}
