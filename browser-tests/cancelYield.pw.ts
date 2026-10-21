import { expect, test } from '@playwright/test'

interface RepeatResult {
  attempts: number
  aborted: number
  finishedWithResult: number
  worstYieldCallsAfterCancel: number
  yieldCallsAfterCancel: number[]
  meanYieldCostMs: number
}

const MAX_YIELD_CALLS_AFTER_CANCEL = 2

test('after cancel() the loop stops within two yield() calls, 100 times out of 100', async ({
  page,
  browserName,
}) => {
  await page.goto('/cancel-yield.html')

  const result = await page.evaluate(() =>
    (
      window as unknown as { cancelYieldStand: { repeat(times: number): Promise<RepeatResult> } }
    ).cancelYieldStand.repeat(100),
  )

  console.log(
    `${browserName}: worst=${result.worstYieldCallsAfterCancel} ` +
      `histogram=${JSON.stringify(histogram(result.yieldCallsAfterCancel))} ` +
      `yieldCost=${(result.meanYieldCostMs * 1000).toFixed(1)}us`,
  )

  expect(result.attempts).toBe(100)
  expect(result.finishedWithResult).toBe(0)
  expect(result.aborted).toBe(100)
  expect(result.worstYieldCallsAfterCancel).toBeLessThanOrEqual(MAX_YIELD_CALLS_AFTER_CANCEL)
})

function histogram(values: number[]): Record<number, number> {
  const counts: Record<number, number> = {}
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1
  return counts
}
