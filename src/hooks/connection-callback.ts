/** Initial subscription callbacks may fire before the awaited connection is
 * adopted. Publish its complete cache explicitly after adoption; thereafter
 * accept callbacks only from that current connection. */
export function currentConnectionCallback<T>(active: () => boolean, current: () => T | undefined, candidate: () => T | undefined, publish: () => void): () => void {
  return () => {
    const source = candidate();
    if (active() && source !== undefined && source === current()) publish();
  };
}
