import { addExtension, pack, unpack } from "msgpackr";
import { PackrTransformStream, UnpackrTransformStream } from "./msgpackr-webstream.ts";
import { TypedEventTarget } from "@worker-tools/typed-event-target";
import { streamToAsyncIter } from 'whatwg-stream-to-async-iter'

import { ReadableStream, WritableStream, TransformStream } from './webStream.ts';

const ensureAsyncIter = <T>(stream: ReadableStream<T>): AsyncIterable<T> => Symbol.asyncIterator in stream 
  ? stream as AsyncIterable<T> 
  : streamToAsyncIter(stream);

/** It's like `pipeThrough`, but for `WritableStream`s. It ensures that every chunk written to `dest` is transformed by `transform`. */
function pipeFrom<T, U>(dest: WritableStream<U>, transform: TransformStream<T, U>): WritableStream<T> {
  const { writable, readable } = transform;
  readable.pipeTo(dest);
  return writable;
}

// const loggingFinalizer = new FinalizationRegistry((heldValue: any[]) => console.log('Finalizing...', ...heldValue));

const MaxUint32 = 0xffff_ffff;
const MaxUint64n = 0xffff_ffff_ffff_ffffn;

function generateId() {
  const random32Upper = BigInt((Math.random() * MaxUint32) >>> 0);
  const random32Lower = BigInt((Math.random() * MaxUint32) >>> 0);
  return ((random32Upper << 32n) | random32Lower)//.toString(16);
}

const DefaultPortId = MaxUint64n//.toString(16);

const Header = "pM" as const; type Header = typeof Header;

export type CustomMessagePortEventMap = MessagePortEventMap & { close: CloseEvent };

export type PortId = number | bigint | string
// const isPortId = (x: unknown): x is PortId => typeof x === "number" || typeof x === "bigint" || typeof x === "string";

export type TransferResult = { id: PortId, remoteId: PortId|null };
export type SerializedWithTransferResult = { serialized: Uint8Array, transferResult: TransferResult[] };

export enum OpCode { Close = 0, Message = 1, Ack = 2 }

export type RPCData = [header: Header, type: OpCode.Message, portId: PortId, sourceId: PortId, transfer: TransferResult[], data: Uint8Array]
export type RPCAck = [header: Header, type: OpCode.Ack, portId: PortId, sourceId: PortId, transfer: TransferResult[]]
export type RPCClose = [header: Header, type: OpCode.Close, portId: PortId, sourceId: PortId|null]
export type RPCMessage = RPCData | RPCClose | RPCAck;

export type AbstractEndpoint = { 
  id: PortId, 
  remoteId: PortId|null, 
  write(x: RPCMessage): void, 
  dispatchEvent(ev: Event): void,
}

export const globalRouteTable = new Map<PortId, WeakRef<AbstractEndpoint>>();
// (globalThis as any).__postMessageRouteTable ||= globalRouteTable;

const unshippedStream = new TransformStream<RPCMessage, RPCMessage>();
const unshippedWriter = unshippedStream.writable.getWriter();
const unshippedPortLoop = {
  id: -1,
  remoteId: -1,
  write(rpcMessage) {
    unshippedWriter.write(rpcMessage);
  },
  dispatchEvent() {
    throw Error("Unreachable");
  }
} satisfies AbstractEndpoint;
receiverLoop.call(unshippedPortLoop, unshippedStream.readable); // HACK

const MessagePortConstructorKey = Symbol('MessagePortConstructorKey');

export class CustomMessageChannel implements MessageChannel {
  readonly port1;
  readonly port2;
  constructor() {
    this.port1 = new CustomMessagePort(MessagePortConstructorKey);
    this.port2 = new CustomMessagePort(MessagePortConstructorKey);
    this.port1.remoteId = this.port2.id;
    this.port2.remoteId = this.port1.id;
  }
}

function dispatchAsEvent(this: AbstractEndpoint, transferResult: TransferResult[], serialized: Uint8Array) {
  let data, ports;
  try {
    [data, ports] = deserializeWithTransfer({ serialized, transferResult });
  } catch (data) {
    return this.dispatchEvent(new MessageEvent('messageerror', { data }));
  }
  const event = new MessageEvent('message', { data });
  Object.defineProperty(event, 'ports', { value: ports })
  return this.dispatchEvent(event);
}

async function receiverLoop(this: AbstractEndpoint, readable: ReadableStream<RPCMessage>) {
  // await this.enabled.promise;
  for await (const rpcMessage of ensureAsyncIter(readable)) {
    try {
      const [, opCode] = rpcMessage;
      switch (opCode) {
        case OpCode.Message: {
          const [, , portId, _sourceId, transferResult, buffer] = rpcMessage;

          if (this instanceof CustomEndpoint) {
            for (const { remoteId } of transferResult) {
              if (remoteId && !globalRouteTable.has(remoteId)) {
                // The direction to reach the other end for any port coming through, even if it's dispatched as a local event below, 
                // must be the endpoint at which it arrived at.
                globalRouteTable.set(remoteId, new WeakRef(this));
              }
            }
          }

          if (portId === this.id) {
            if (transferResult.length > 0) {
              const writer = globalRouteTable.get(this.remoteId!)?.deref(); // this must exist since the message reached us, otherwise how did we get here?
              if (writer instanceof CustomEndpoint) {
                // Only need to send Ack if the message was received by an endpoint and contained transferred ports.
                // We attach a copy of the transfer results and the original port id, s.t. intermediate nodes can (finally) update their routing tables.
                writer.write([Header, OpCode.Ack, this.remoteId!, portId, transferResult]);
              }
            }
            dispatchAsEvent.call(this, transferResult, buffer);
            continue;
          }

          if (globalRouteTable.has(portId)) {
            if (this instanceof CustomMessagePort) console.warn("this should not happen");

            // Forwarding a message
            const writer = globalRouteTable.get(portId)!.deref()!;

            for (const { id } of transferResult) {
              // When forwarding a message, we need to update the route table for all transferred ports to point to the same direction the message went.
              globalRouteTable.set(id, new WeakRef(writer));
            }

            writer.write(rpcMessage);

            // // console.log('forwarding', portId, transferResult, [...globalRouteTable].map(([k, v]) => [k, v.deref()]));
            // const [header, opCode, , , transferList, buffer] = rpcMessage as RPCData;
            // console.log('forwarding', '=>', writer.constructor.name, [header, opCode, portId, transferList, buffer, unpack(buffer)]);
          } 
          else {
            // console.log(rpcMessage, unpack(rpcMessage[5]))
            throw Error("Can't forward message to unknown port")
          }

          break;
        }
        case OpCode.Ack: {
          const [, , portId, sourceId, transferResult] = rpcMessage;

          if (portId === this.id) {
            continue;
          }

          if (globalRouteTable.has(portId)) {
            const forwardWriter = globalRouteTable.get(portId)!.deref()!;
            const backwardWriter = globalRouteTable.get(sourceId)!.deref()!;

            for (const { id, remoteId } of transferResult) {
              // If we've previously sent the other side of the port in the same direction as this acknowledgement is coming from,
              // it is now closer to the remote port than we are, and we can delete it from our routing table.
              if (remoteId && globalRouteTable.get(remoteId)?.deref() === backwardWriter) {
                globalRouteTable.delete(remoteId);
                // If the port we've just transferred also points backwards, we can delete it from our routing table.
                if (globalRouteTable.get(id)?.deref() === backwardWriter) {
                  globalRouteTable.delete(id);
                }
              }
            }

            // Forwarding the ack message
            forwardWriter.write(rpcMessage);
          }

          break;
        }
        case OpCode.Close: {
          const [, , portId, initPortId] = rpcMessage;

          const writer = globalRouteTable.get(portId)?.deref();
          globalRouteTable.delete(portId);
          initPortId && globalRouteTable.delete(initPortId);

          if (portId === this.id && this instanceof CustomMessagePort) {
            this.detached = true;
            this.remoteId = null;
            this.writer.close();
            this.dispatchEvent(new CloseEvent('close', { wasClean: !!initPortId }));
            continue;
          }

          if (writer) {
            // if this is an intermediate node in the route, forward the close message (cleanup already done)
            writer.write(rpcMessage);
          }

          break;
        }
        default: {
          throw Error(`Unknown OpCode: ${opCode}`);
        }
      }
      // console.log(globalRouteTable.keys())
    } catch (err) {
      console.error(err);
      // TODO: what do here??
    }
  }
}

const getTransfer = (x?: Transferable[] | StructuredSerializeOptions) => x != null && 'transfer' in x ? x.transfer : Array.isArray(x) ? x : undefined;
const isMessagePort = (x: unknown): x is CustomMessagePort => x instanceof CustomMessagePort;

function postMessage(this: CustomEndpoint|CustomMessagePort, remoteId: PortId|null, message: any, transfer?: Transferable[] | StructuredSerializeOptions) {
  const ports = getTransfer(transfer)?.filter(isMessagePort) ?? [];
  if (ports.some(port => port === this)) {
    throw new DOMException('Cannot transfer source port', 'DataCloneError');
  }
  const doomed = remoteId != null && ports.find(port => port.id === remoteId);
  const { serialized, transferResult } = serializeWithTransferResult(message, ports);
  if (remoteId == null || doomed) return console.warn("Doomed");

  const writer = this instanceof CustomEndpoint ? this : globalRouteTable.get(remoteId)!.deref()!;

  for (const { id } of transferResult) {
    globalRouteTable.set(id, new WeakRef(writer instanceof CustomMessagePort ? unshippedPortLoop : writer));
  }

  writer.write([Header, OpCode.Message, remoteId, this.id, transferResult, serialized]);
}

const serializeMemory = new Map<MessagePort, TransferResult>();

function serializeWithTransferResult(value: any, ports: CustomMessagePort[]): SerializedWithTransferResult {
  try {
    const transferResult = ports.map((port) => {
      if (port.detached) throw new DOMException('Cannot transfer detached port', 'DataCloneError');
      if (serializeMemory.has(port)) throw new DOMException('Cannot transfer port more than once', 'DataCloneError');
      const { id, remoteId } = port;
      serializeMemory.set(port, { id, remoteId });

      port.detached = true
      port.remoteId = null;
      port.writer.close();

      return { id, remoteId }
    }) ?? [];
    const serialized = pack(value);
    return { serialized, transferResult };
  } finally {
    serializeMemory.clear();
  }
}

const deserializeMemory = new Map<PortId, CustomMessagePort>();

function deserializeWithTransfer(value: SerializedWithTransferResult): [any, CustomMessagePort[]] {
  try {
    const { serialized, transferResult } = value;
    const ports = transferResult.map(({ id, remoteId }) => {
      const port = new CustomMessagePort(MessagePortConstructorKey, id, remoteId);
      deserializeMemory.set(id, port);
      return port;
    });
    const data = unpack(serialized);
    return [data, ports];
  } finally {
    deserializeMemory.clear();
  }
}

function finalizeMessagePort({ id, remoteId }: TransferResult) {
  if (remoteId) {
    globalRouteTable.get(remoteId)?.deref()?.write([Header, OpCode.Close, remoteId, id]);
    globalRouteTable.delete(remoteId); // ensure close op isn't sent twice
  }
  globalRouteTable.delete(id);
}

const portFinalizer = new FinalizationRegistry<TransferResult>((port: TransferResult) => {
  finalizeMessagePort(port);
});

export class CustomMessagePort extends TypedEventTarget<MessagePortEventMap> implements MessagePort {
  readonly id: PortId;
  #remoteId: PortId|null = null;
  readonly writer;
  detached = false
  // enabled = Promise.withResolvers<void>();

  get shipped() {
    // A port is shipped if it has a remote id and the destination of the remote id is an endpoint, not a custom port instance.
    return this.remoteId && globalRouteTable.get(this.remoteId)?.deref() instanceof CustomEndpoint;
  }

  constructor();
  constructor(key: symbol);
  constructor(key: symbol, id: PortId, remoteId: PortId|null);
  constructor(key?: symbol, id?: PortId, remoteId?: PortId|null) {
    if (key !== MessagePortConstructorKey) throw new TypeError("Illegal constructor");

    super();

    this.id = id ?? generateId();
    this.remoteId = remoteId ?? null;

    const { readable, writable } = new TransformStream<RPCMessage, RPCMessage>();
    this.writer = writable.getWriter();

    globalRouteTable.set(this.id, new WeakRef(this));

    receiverLoop.call(this, readable);
  }

  get remoteId() { return this.#remoteId }
  set remoteId(remoteId: PortId|null) {
    if (remoteId && !this.#remoteId) {
      // Once we have a remoteId, we can register cleanup for the global route table
      portFinalizer.register(this, { id: this.id, remoteId: this.remoteId }, this);
      this.#remoteId = remoteId;
    } else if (!remoteId && this.#remoteId) {
      // When the remoteId is cleared, we MUST unregister the cleanup, otherwise it will mess with the global route table
      portFinalizer.unregister(this);
      this.#remoteId = remoteId;
    }
  }

  postMessage(message: any, transfer?: Transferable[] | StructuredSerializeOptions): void {
    postMessage.call(this, this.remoteId, message, transfer);
  }

  start(): void {
    // this.enabled.resolve();
  }

  close(): void {
    finalizeMessagePort(this);
    this.detached = true;
    this.remoteId = null;
    this.writer.close();
    // this.enabled.resolve(); // unlock the receiver loop if it hasn't been started yet. Is this necessary??
  }

  write(data: RPCMessage) {
    this.writer.write(data);
  }

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
}

export class CustomEndpoint extends TypedEventTarget<WorkerEventMap> {
  readonly writer;
  // enabled = { promise: Promise.resolve() };
  constructor(
    stream: { 
      readable: ReadableStream<Uint8Array>, 
      writable: WritableStream<Uint8Array>,
    },
  ) {
    super();

    const writable: WritableStream<RPCMessage> = pipeFrom(stream.writable, new PackrTransformStream());
    const readable: ReadableStream<RPCMessage> = stream.readable.pipeThrough(new UnpackrTransformStream());
    this.writer = writable.getWriter();

    receiverLoop.call(this, readable);
  }

  id = DefaultPortId 
  remoteId = DefaultPortId;

  write(rpcMessage: RPCMessage) {
    this.writer.write(rpcMessage);
  }

  postMessage(message: any, transfer?: StructuredSerializeOptions | Transferable[]): void {
    postMessage.call(this, DefaultPortId, message, transfer);
  }

  terminate(): void {
    for (const [portId, writer] of globalRouteTable.entries()) {
      if (writer.deref() === this) { // if the port is referencing us as a gateway, we have to forcefully close the port
        this.writer.write([Header, OpCode.Close, portId, null]);
        globalRouteTable.delete(portId);
      }
    }
    this.writer.close();
  }

  #onmessage: ((this: CustomEndpoint, ev: MessageEvent<any>) => any)|null = null;
  set onmessage(handler: ((this: CustomEndpoint, ev: MessageEvent<any>) => any)|null) { 
    if (this.#onmessage) this.removeEventListener('message', this.#onmessage);
    if (handler) this.addEventListener('message', this.#onmessage = handler.bind(this));
  }
  get onmessage() { return this.#onmessage }

  #onmessageerror: ((this: CustomEndpoint, ev: MessageEvent<any>) => any)|null = null;
  set onmessageerror(handler: ((this: CustomEndpoint, ev: MessageEvent<any>) => any)|null) { 
    if (this.#onmessageerror) this.removeEventListener('messageerror', this.#onmessageerror);
    if (handler) this.addEventListener('messageerror', this.#onmessageerror = handler.bind(this))
  }
  get onmessageerror() { return this.#onmessageerror }

  #onerror: ((this: CustomEndpoint, ev: ErrorEvent) => any)|null = null;
  set onerror(handler: ((this: CustomEndpoint, ev: ErrorEvent) => any)|null) { 
    if (this.#onerror) this.removeEventListener('error', this.#onerror);
    if (handler) this.addEventListener('error', this.#onerror = handler.bind(this))
  }
  get onerror() { return this.#onerror }
}

addExtension({
  Class: CustomMessagePort,
  type: 0x50, // 'P'
  write(value: CustomMessagePort) {
    const transferResult = serializeMemory.get(value);
    if (!transferResult) throw new DOMException('Port not transferred', 'DataCloneError');
    const { id, remoteId } = transferResult;
    return { id, remoteId };
  },
  read(value: TransferResult) {
    const port = deserializeMemory.get(value.id);
    if (!port) throw Error("Port was not part of transfer list");
    return port;
  },
})
