import * as CBOR from "cbor-x";
import { CBOREncoderTransformStream, CBORDecoderTransformStream } from "./cbor-x-webstream.ts";
import { TypedEventTarget } from "@worker-tools/typed-event-target";
import { streamToAsyncIter } from 'whatwg-stream-to-async-iter'

import { ReadableStream, WritableStream, TransformStream } from './webStream.ts';

//#region Mini-lib
const ensureAsyncIter = <T>(stream: ReadableStream<T>): AsyncIterable<T> => Symbol.asyncIterator in stream 
  ? stream as AsyncIterable<T> 
  : streamToAsyncIter(stream);

interface PromiseWithResolvers<T> {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: any) => void;
}

function promiseWithResolvers<T>(): PromiseWithResolvers<T> {
  if ('withResolvers' in Promise && typeof Promise.withResolvers === 'function') return Promise.withResolvers();
  let resolve, reject;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej });
  return { promise, resolve: resolve!, reject: reject! };
}

/** It's like `pipeThrough`, but for `WritableStream`s. It ensures that every chunk written to `dest` is transformed by `transform`. */
function pipeFrom<T, U>(dest: WritableStream<U>, transform: TransformStream<T, U>): WritableStream<T> {
  const { writable, readable } = transform;
  readable.pipeTo(dest);
  return writable;
}

// const loggingFinalizer = new FinalizationRegistry((heldValue: any[]) => console.log('Finalizing...', ...heldValue));
//#endregion

const cborEncoder = new CBOR.Encoder({ structuredClone: true, useRecords: false, pack: false, tagUint8Array: true, structures: undefined })
const cborDecoder = new CBOR.Decoder({ structuredClone: true, useRecords: false, pack: false, tagUint8Array: true, structures: undefined })

const MaxUint32 = 0xffff_ffff;
const MaxUint64n = 0xffff_ffff_ffff_ffffn;

function generateId() {
  const random32Upper = BigInt((Math.random() * MaxUint32) >>> 0);
  const random32Lower = BigInt((Math.random() * MaxUint32) >>> 0);
  return ((random32Upper << 32n) | random32Lower)
}

const DefaultPortId = MaxUint64n;

const Header = "pM" as const; type Header = typeof Header;

export type WireMessagePortEventMap = MessagePortEventMap & { close: CloseEvent };

type PortId = number | bigint | string

type TransferResult = { id: PortId, remoteId: PortId|null };
type SerializedWithTransferResult = { serialized: Uint8Array, transferResult: TransferResult[] };

enum MsgCode { Close = 0, Message = 1, Ack = 2 }

type RPCData  = [header: Header, type: MsgCode.Message, destId: PortId, srcId: PortId, transfer: TransferResult[], data: Uint8Array]
type RPCAck   = [header: Header, type: MsgCode.Ack,     destId: PortId, srcId: PortId, transfer: TransferResult[]]
type RPCClose = [header: Header, type: MsgCode.Close,   destId: PortId, srcId: PortId|null]

type RPCMessage = RPCData | RPCClose | RPCAck;

type RPCWriter = WritableStreamDefaultWriter<RPCMessage> & { identifier: any };

const tagWriter = (writer: WritableStreamDefaultWriter<RPCMessage>, identifier: any): RPCWriter => Object.assign(writer, { identifier });

const kGlobalRouteTable = Symbol.for('pM-globalRouteTable');
const globalRouteTable: Map<PortId, RPCWriter> = ((globalThis as any)[kGlobalRouteTable] ||= new Map());

export type EndpointLike = { dispatchEvent(ev: Event): void }
const _writer = new WeakMap<EndpointLike, RPCWriter>();
const _id = new WeakMap<EndpointLike, PortId>();
const _remoteId = new WeakMap<EndpointLike, PortId|null>();
const _detached = new WeakMap<EndpointLike, boolean>();
const _shipped = new WeakMap<RPCWriter, boolean>();

// FIXME: Must the unshipped event loop be a super global as well?
const unshippedStream = new TransformStream<RPCMessage, RPCMessage>();
const unshippedWriter = tagWriter(unshippedStream.writable.getWriter(), '[Unshipped]');
const unshippedPortLoop = { dispatchEvent() { throw Error("Unreachable") } } satisfies EndpointLike;
_writer.set(unshippedPortLoop, unshippedWriter);
endpointReceiverLoop.call(unshippedPortLoop, unshippedStream.readable);

const kMessagePortConstructor = Symbol('MessagePortConstructor');

export class WireMessageChannel implements MessageChannel {
  readonly port1;
  readonly port2;
  constructor() {
    this.port1 = new WireMessagePort(kMessagePortConstructor);
    this.port2 = new WireMessagePort(kMessagePortConstructor);
    _remoteIdSetter(this.port1, _id.get(this.port2)!);
    _remoteIdSetter(this.port2, _id.get(this.port1)!);
  }
}

export class WireMessageEvent<T = any> extends Event implements MessageEvent<T|null> {
  readonly data: T|null;
  readonly ports: readonly MessagePort[];
  constructor(type: string, eventInitDict: MessageEventInit<T> & { ports?: readonly MessagePort[] }) {
    super(type, eventInitDict);
    this.data = eventInitDict.data ?? null;
    this.ports = eventInitDict.ports ?? [];
  }
  //#region Boilerplate
  readonly origin = ''; 
  readonly lastEventId = ''; 
  readonly source = null;
  initMessageEvent(type: string, bubbles?: boolean | undefined, cancelable?: boolean | undefined, data?: any, origin?: string | undefined, lastEventId?: string | undefined, source?: MessageEventSource | null | undefined, ports?: MessagePort[] | undefined): void {
    throw new Error("Method not implemented.");
  }
  //#endregion
}

function acknowledgeTransfer(this: EndpointLike, transferResult: TransferResult[]) {
  if (transferResult.length > 0) {
    const remoteId = _remoteId.get(this)!;
    const writer = globalRouteTable.get(remoteId); // this must exist since the message reached us, otherwise how did we get here?
    // Need to send Ack if message contained transferred ports.
    // We attach a copy of the transfer results and the original port id, s.t. intermediate nodes can potentially clean up their routing tables.
    // This happens when a port was sent in the direction it came from. Note that we can only clean up routing tables when receiving ACK,
    // since in-flight messages from the other side could still arrive and need to be forwarded (returned) to avoid loss of messages.
    writer?.write([Header, MsgCode.Ack, remoteId, _id.get(this)!, transferResult]);
  }
}

function dispatchAsEvent(this: EndpointLike, transferResult: TransferResult[], serialized: Uint8Array) {
  let data, ports;
  try {
    [data, ports] = deserializeWithTransfer({ serialized, transferResult });
  } catch (data) {
    return this.dispatchEvent(new WireMessageEvent('messageerror', { data }));
  }
  const event = new WireMessageEvent('message', { data, ports });
  return this.dispatchEvent(event);
}

async function endpointReceiverLoop(this: EndpointLike, readable: ReadableStream<RPCMessage>) {
  for await (const rpcMessage of ensureAsyncIter(readable)) {
    try {
      const [, opCode] = rpcMessage;
      switch (opCode) {
        case MsgCode.Message: {
          const [, , portId, , transferResult, buffer] = rpcMessage;

          for (const { remoteId } of transferResult) {
            if (remoteId && !globalRouteTable.has(remoteId)) {
              // The direction to reach the other end for any port coming through, even if it's dispatched as a local event below, 
              // must be the endpoint at which it arrived at.
              globalRouteTable.set(remoteId, _writer.get(this)!);
            }
          }

          if (portId === _id.get(this)) {
            acknowledgeTransfer.call(this, transferResult);
            dispatchAsEvent.call(this, transferResult, buffer);
            continue;
          }

          // Forwarding a message
          if (globalRouteTable.has(portId)) {
            const writer = globalRouteTable.get(portId);
            if (!writer) throw Error("No writer found for portId")

            for (const { id } of transferResult) {
              // When forwarding a message, we need to update the route table for all transferred ports to point to the same direction the message went.
              globalRouteTable.set(id, writer);
            }

            writer.write(rpcMessage);
          } 
          else {
            throw Error("Can't forward message to unknown port")
          }

          break;
        }
        case MsgCode.Ack: {
          const [, , portId, sourceId, transferResult] = rpcMessage;

          if (globalRouteTable.has(portId)) {
            const forwardWriter = globalRouteTable.get(portId);
            const backwardWriter = globalRouteTable.get(sourceId);

            for (const { id, remoteId } of transferResult) {
              // If we've previously sent the other side of the port in the same direction as this acknowledgement is coming from,
              // it is now closer to the remote port than we are, and we can delete it from our routing table.
              if (remoteId && globalRouteTable.get(remoteId) === backwardWriter) {
                globalRouteTable.delete(remoteId);
                // If the port we've just transferred also points backwards, we can delete it from our routing table.
                if (globalRouteTable.get(id) === backwardWriter) {
                  globalRouteTable.delete(id);
                }
              }
            }

            // Forwarding the ack message
            forwardWriter?.write(rpcMessage);
          }

          break;
        }
        case MsgCode.Close: {
          const [, , portId, initPortId] = rpcMessage;

          const writer = globalRouteTable.get(portId);

          globalRouteTable.delete(portId);
          initPortId && globalRouteTable.delete(initPortId);

          // Forward the close message if we haven't reached the destination yet
          writer?.write(rpcMessage);

          break;
        }
        default: {
          throw Error(`Unknown OpCode: ${opCode}`);
        }
      }
    } catch (err) {
      // TODO: what do here??
      console.error(err);
      continue;
    }
  }
}

const getTransfer = (x?: Transferable[] | StructuredSerializeOptions) => x != null && 'transfer' in x ? x.transfer : Array.isArray(x) ? x : undefined;
const isMessagePort = (x: unknown): x is WireMessagePort => x instanceof WireMessagePort;

function postMessage(this: WireEndpoint|WireMessagePort, remoteId: PortId|null, message: any, transfer?: Transferable[] | StructuredSerializeOptions) {
  const ports = getTransfer(transfer)?.filter(isMessagePort) ?? [];
  if (ports.some(port => port === this)) {
    throw new DOMException('Cannot transfer source port', 'DataCloneError');
  }
  const doomed = remoteId != null && ports.find(port => _id.get(port) === remoteId);
  const { serialized, transferResult } = serializeWithTransferResult(message, ports);
  if (remoteId == null || doomed) return; // TODO: print warning?

  const writer = this instanceof WireEndpoint ? _writer.get(this)! : globalRouteTable.get(remoteId)!;

  // For each transferred port, we need to update the global routing table to point the same direction as the message went.
  for (const { id } of transferResult) {
    // The only exception are unshipped ports, which should point to the unshipped event loop instead, where messages are dispatched as local events.
    const remoteWriter = _shipped.has(writer) ? writer : unshippedWriter;
    globalRouteTable.set(id, remoteWriter);
  }

  // Keep the shipped status updated
  if (_shipped.has(writer)) {
    for (const port of ports) {
      const portWriter = globalRouteTable.get(_remoteId.get(port)!);
      portWriter && _shipped.set(portWriter, true);
    }
  }

  writer.write([Header, MsgCode.Message, remoteId, _id.get(this)!, transferResult, serialized]);
}

// Temporary storage for deduplication
const serializeMemory = new Map<MessagePort, TransferResult>();

function serializeWithTransferResult(value: any, ports: WireMessagePort[]): SerializedWithTransferResult {
  try {
    const transferResult = ports.map((port) => {
      if (_detached.get(port)) throw new DOMException('Cannot transfer detached port', 'DataCloneError');
      if (serializeMemory.has(port)) throw new DOMException('Cannot transfer port more than once', 'DataCloneError');
      const id = _id.get(port)!;
      const remoteId = _remoteId.get(port)!;
      serializeMemory.set(port, { id, remoteId });

      _detached.set(port, true);
      _remoteIdSetter(port, null);
      _writer.get(port)!.close();

      return { id, remoteId }
    }) ?? [];
    const serialized = cborEncoder.encode(value);
    return { serialized, transferResult };
  } finally {
    serializeMemory.clear();
  }
}

// Temporary storage for deduplication
const deserializeMemory = new Map<PortId, WireMessagePort>();

function deserializeWithTransfer(value: SerializedWithTransferResult): [any, WireMessagePort[]] {
  try {
    const { serialized, transferResult } = value;
    const ports = transferResult.map(({ id, remoteId }) => {
      const port = new WireMessagePort(kMessagePortConstructor, id, remoteId);
      deserializeMemory.set(id, port);
      return port;
    });
    const data = cborDecoder.decode(serialized);
    return [data, ports];
  } finally {
    deserializeMemory.clear();
  }
}

function finalizeMessagePort({ id, remoteId }: TransferResult) {
  if (remoteId) {
    globalRouteTable.get(remoteId)?.write([Header, MsgCode.Close, remoteId, id]);
    globalRouteTable.delete(remoteId); // ensure close op isn't sent twice
  }
  globalRouteTable.delete(id);
}

const portFinalizer = new FinalizationRegistry<TransferResult>((port: TransferResult) => {
  finalizeMessagePort(port);
});

function _remoteIdSetter(that: WireMessagePort, nextRemoteId: PortId|null) {
  const id = _id.get(that)!;
  const remoteId = _remoteId.get(that);
  if (nextRemoteId && !remoteId) {
    // Once we have a remoteId, we can register cleanup for the global route table
    portFinalizer.register(that, { id, remoteId: nextRemoteId }, that);
    _remoteId.set(that, nextRemoteId);
  } else if (!nextRemoteId && remoteId) {
    // When the remoteId is cleared, we MUST unregister the cleanup, otherwise it will mess with the global route table
    portFinalizer.unregister(that);
    _remoteId.set(that, nextRemoteId);
  }
}

// TODO: make message port exempt from gc while a message event listener is active
export class WireMessagePort extends TypedEventTarget<MessagePortEventMap> implements MessagePort {
  // #enabled = promiseWithResolvers<void>();

  constructor(key: symbol);
  constructor(key: symbol, designatedId: PortId, remoteId: PortId|null);
  constructor(key: symbol, designatedId?: PortId, remoteId?: PortId|null) {
    if (key !== kMessagePortConstructor) throw new TypeError("Illegal constructor");

    super();

    const id = designatedId ?? generateId();
    _id.set(this, id);
    _remoteIdSetter(this, remoteId ?? null);

    const { readable, writable } = new TransformStream<RPCMessage, RPCMessage>();
    const writer = tagWriter(writable.getWriter(), id);
    _writer.set(this, writer);

    _shipped.set(writer, !!remoteId); // if the port has a remote id it was shipped
    _detached.set(this, false);

    globalRouteTable.set(id, writer);

    this.#receiverLoop(readable);
  }

  async #receiverLoop(this: WireMessagePort, readable: ReadableStream<RPCMessage>) {
    // await this.#enabled.promise;
    for await (const rpcMessage of ensureAsyncIter(readable)) {
      try {
        const [, opCode, portId] = rpcMessage;
        switch (opCode) {
          case MsgCode.Message:
            const [, , , , transferResult, buffer] = rpcMessage;
            if (portId === _id.get(this)) {
              acknowledgeTransfer.call(this, transferResult);
              dispatchAsEvent.call(this, transferResult, buffer);
              continue;
            }
            throw Error("Message sent to wrong port")
          case MsgCode.Ack:
            if (portId === _id.get(this)) continue;
            throw Error("Message sent to wrong port")
          case MsgCode.Close:
            const [, , , initPortId] = rpcMessage;
            if (portId === _id.get(this)) {
              _detached.set(this, true);
              _remoteIdSetter(this, null);
              this.#writer.close();
              this.dispatchEvent(new CloseEvent('close', { wasClean: !!initPortId }));
              continue;
            }
            throw Error("Message sent to wrong port")
          default:
            throw Error(`Unknown OpCode: ${opCode}`);
        }
      } catch (err) {
        // TODO: what do here??
        console.error(err);
        continue;
      }
    }
  }

  get #id() { return _id.get(this)! }
  get #remoteId() { return _remoteId.get(this) ?? null }
  get #writer() { return _writer.get(this)! }

  postMessage(message: any, transfer?: Transferable[] | StructuredSerializeOptions): void {
    postMessage.call(this, this.#remoteId, message, transfer);
  }

  start(): void {
    // this.#enabled.resolve();
  }

  close(): void {
    finalizeMessagePort({ id: this.#id, remoteId: this.#remoteId });
    _detached.set(this, true);
    _remoteIdSetter(this, null);
    _writer.get(this)!.close();
    // this.#enabled.resolve(); // unlock the receiver loop if it hasn't been started yet. Is this necessary??
  }

  //#region Event properties boilerplate
  #onmessage: ((this: MessagePort, ev: MessageEvent<any>) => any)|null = null;
  set onmessage(handler: ((this: MessagePort, ev: MessageEvent<any>) => any)|null) { 
    if (this.#onmessage) this.removeEventListener('message', this.#onmessage);
    if (handler) this.addEventListener('message', this.#onmessage = handler.bind(this));
    this.start();
  }
  get onmessage() { return this.#onmessage }

  #onmessageerror: ((this: MessagePort, ev: MessageEvent<any>) => any)|null = null;
  set onmessageerror(handler: ((this: MessagePort, ev: MessageEvent<any>) => any)|null) { 
    if (this.#onmessageerror) this.removeEventListener('messageerror', this.#onmessageerror);
    if (handler) this.addEventListener('messageerror', this.#onmessageerror = handler.bind(this));
  }
  get onmessageerror() { return this.#onmessageerror }
  // #endregion
}

export class WireEndpoint extends TypedEventTarget<WorkerEventMap> {
  constructor(
    stream: { 
      readable: ReadableStream<Uint8Array>, 
      writable: WritableStream<Uint8Array>,
    },
    identifier?: any,
  ) {
    super();

    _id.set(this, DefaultPortId); 
    _remoteId.set(this, DefaultPortId);

    const writable: WritableStream<RPCMessage> = pipeFrom(stream.writable, new CBOREncoderTransformStream());
    const readable: ReadableStream<RPCMessage> = stream.readable.pipeThrough(new CBORDecoderTransformStream());
    const writer = tagWriter(writable.getWriter(), identifier);
    _writer.set(this, writer);

    _shipped.set(writer, true); // Endpoints are "shipped" by definition.

    endpointReceiverLoop.call(this, readable);
  }

  get #writer() { return _writer.get(this)! }

  postMessage(message: any, transfer?: StructuredSerializeOptions | Transferable[]): void {
    postMessage.call(this, DefaultPortId, message, transfer);
  }

  terminate(): void {
    for (const [portId, writer] of globalRouteTable.entries()) {
      if (writer === this.#writer) { // if the port is referencing us as a gateway, we have to forcefully close the port
        this.#writer.write([Header, MsgCode.Close, portId, null]);
        globalRouteTable.delete(portId);
      }
    }
    this.#writer.close();
  }

  //#region Event properties boilerplate
  #onmessage: ((this: WireEndpoint, ev: MessageEvent<any>) => any)|null = null;
  set onmessage(handler: ((this: WireEndpoint, ev: MessageEvent<any>) => any)|null) { 
    if (this.#onmessage) this.removeEventListener('message', this.#onmessage);
    if (handler) this.addEventListener('message', this.#onmessage = handler.bind(this));
  }
  get onmessage() { return this.#onmessage }

  #onmessageerror: ((this: WireEndpoint, ev: MessageEvent<any>) => any)|null = null;
  set onmessageerror(handler: ((this: WireEndpoint, ev: MessageEvent<any>) => any)|null) { 
    if (this.#onmessageerror) this.removeEventListener('messageerror', this.#onmessageerror);
    if (handler) this.addEventListener('messageerror', this.#onmessageerror = handler.bind(this))
  }
  get onmessageerror() { return this.#onmessageerror }

  #onerror: ((this: WireEndpoint, ev: ErrorEvent) => any)|null = null;
  set onerror(handler: ((this: WireEndpoint, ev: ErrorEvent) => any)|null) { 
    if (this.#onerror) this.removeEventListener('error', this.#onerror);
    if (handler) this.addEventListener('error', this.#onerror = handler.bind(this))
  }
  get onerror() { return this.#onerror }
  // #endregion
}

CBOR.addExtension({
  tag: 0x524a,
  Class: RegExp,
  encode(regexp, encode) { return encode([regexp.source, regexp.flags]) },
  decode(data: [string, string]) { return new RegExp(data[0], data[1]) },
});

CBOR.addExtension({
  tag: 0xcab0,
  Class: WireMessagePort,
  encode(value: WireMessagePort, encode) {
    const transferResult = serializeMemory.get(value);
    if (!transferResult) throw new DOMException('Port not transferred', 'DataCloneError');
    return encode(transferResult);
  },
  decode(value: TransferResult) {
    const port = deserializeMemory.get(value.id);
    if (!port) throw new DOMException("Port was not part of transfer list", 'DataCloneError');
    return port;
  },
})

/** @deprecated For testing only! */
export const __internals = {
  globalRouteTable,
  _writer,
  _id,
  _remoteId,
  _detached,
  _shipped,
  unshippedStream,
  unshippedWriter,
  unshippedPortLoop,
};
