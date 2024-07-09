type ReceiverEndpoint = Pick<EventTarget, "addEventListener"|"removeEventListener">;
interface Endpoint extends ReceiverEndpoint {
  postMessage(message: any, transfer?: Transferable[]): void;
}
interface NodeEndpoint {
  postMessage(message: any, transfer?: any[]): void;
  on(type: string, listener: EventListenerOrEventListenerObject, options?: {}): void;
  off(type: string, listener: EventListenerOrEventListenerObject, options?: {}): void;
}
export const Worker: typeof globalThis.Worker = import.meta.env.BROWSER_EXT ? globalThis.Worker : require('worker_threads').Worker;
export const MessageChannel: typeof globalThis.MessageChannel = import.meta.env.BROWSER_EXT ? globalThis.MessageChannel : require('worker_threads').MessageChannel;
export const MessagePort: typeof globalThis.MessagePort = import.meta.env.BROWSER_EXT ? globalThis.MessagePort : require('worker_threads').MessagePort;
export const BroadcastChannel: typeof globalThis.BroadcastChannel = import.meta.env.BROWSER_EXT ? globalThis.BroadcastChannel : require('worker_threads').BroadcastChannel;
export const parentPort: Endpoint|NodeEndpoint = import.meta.env.BROWSER_EXT ? globalThis : require('worker_threads').parentPort;
