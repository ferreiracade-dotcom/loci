/**
 * Runs async tasks strictly in the order they were pushed, regardless of how long each one
 * takes. Used to persist workspace state: firing writes off independently risks a slower
 * earlier write landing after a faster later one and silently reverting good state.
 */
export function createSequentialQueue(): (task: () => Promise<void>) => void {
  let tail: Promise<void> = Promise.resolve()
  return (task) => {
    tail = tail.then(
      () => task(),
      () => task()
    )
    // Mark this promise as handled even if nothing pushes after it — otherwise a
    // rejection on the last-ever-queued task is an unhandled rejection.
    tail.catch(() => {
      /* already retried via the chain above */
    })
  }
}
