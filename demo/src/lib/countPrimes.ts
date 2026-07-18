/**
 * Deliberately unoptimized trial-division prime counting — real, substantial CPU work
 * (unlike a busy-wait loop), used both on the main thread and inside `primes.worker.ts` so
 * the "sequential vs pool" comparison in the demo is the same algorithm on both sides.
 */
export function isPrime(n: number): boolean {
  if (n < 2) return false
  if (n % 2 === 0) return n === 2
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false
  }
  return true
}

export function countPrimesInRange(from: number, to: number): number {
  let count = 0
  for (let n = from; n < to; n++) {
    if (isPrime(n)) count++
  }
  return count
}
