/**
 * Runs an async mapper over all items in sequential batches of `batchSize`.
 * Within each batch all items run concurrently (Promise.all); batches run
 * one after the other to avoid bursting API rate limits.
 *
 * @example
 * // Fetch tamper-protection for 51 endpoints, 5 at a time
 * const results = await batchAll(endpoints, 5, (ep) => fetchTP(ep.id));
 */
export async function batchAll<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((item, j) => fn(item, i + j)));
    results.push(...batchResults);
  }
  return results;
}
