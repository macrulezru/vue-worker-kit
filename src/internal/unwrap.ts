import { isProxy, toRaw } from 'vue'
import type { UnwrapMode } from '../types'

const MAX_UNWRAP_DEPTH = 100
const MAX_SCAN_NODES = 100_000

function isPlainContainer(value: object): boolean {
  if (Array.isArray(value)) return true
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function unwrapDeep(value: unknown, seen: Map<object, unknown>, depth: number): unknown {
  const raw = toRaw(value)
  if (typeof raw !== 'object' || raw === null) return raw
  if (!isPlainContainer(raw) || depth > MAX_UNWRAP_DEPTH) return raw
  const known = seen.get(raw)
  if (known !== undefined) return known

  if (Array.isArray(raw)) {
    const copy: unknown[] = new Array(raw.length)
    seen.set(raw, copy)
    for (let index = 0; index < raw.length; index++) {
      if (index in raw) copy[index] = unwrapDeep(raw[index], seen, depth + 1)
    }
    return copy
  }

  const copy: Record<string, unknown> =
    Object.getPrototypeOf(raw) === null ? Object.create(null) : {}
  seen.set(raw, copy)
  for (const key of Object.keys(raw)) {
    copy[key] = unwrapDeep((raw as Record<string, unknown>)[key], seen, depth + 1)
  }
  return copy
}

export function unwrapInput(input: unknown, mode: UnwrapMode): unknown {
  if (mode === 'deep') return unwrapDeep(input, new Map(), 0)
  return toRaw(input)
}

export function findReactivePath(input: unknown): string | undefined {
  const seen = new WeakSet<object>()
  let scanned = 0

  function visit(value: unknown, path: string, depth: number): string | undefined {
    if (typeof value !== 'object' || value === null) return undefined
    if (isProxy(value)) return path
    if (!isPlainContainer(value) || seen.has(value) || depth > MAX_UNWRAP_DEPTH) return undefined
    seen.add(value)
    if (++scanned > MAX_SCAN_NODES) return undefined

    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) {
        const found = visit(value[index], `${path}[${index}]`, depth + 1)
        if (found !== undefined) return found
      }
      return undefined
    }

    for (const key of Object.keys(value)) {
      const found = visit((value as Record<string, unknown>)[key], `${path}.${key}`, depth + 1)
      if (found !== undefined) return found
    }
    return undefined
  }

  return visit(toRaw(input), 'input', 0)
}
