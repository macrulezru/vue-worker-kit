/**
 * Same O(n^2) algorithm as `workers/sort.worker.ts`, minus the progress/cancel yield points —
 * used for the "run this on the main thread" side of the demo comparison, so the two runs are
 * an apples-to-apples measure of "same work, different thread", not "different algorithms".
 */
export function insertionSort(values: number[]): number[] {
  const arr = [...values]
  for (let i = 1; i < arr.length; i++) {
    const current = arr[i]
    let j = i - 1
    while (j >= 0 && arr[j] > current) {
      arr[j + 1] = arr[j]
      j--
    }
    arr[j + 1] = current
  }
  return arr
}
