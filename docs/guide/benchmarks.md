# Benchmarks

Performance comparison between main thread execution, single worker, and worker pool.

## Test Environment

- **CPU**: 4 cores (simulated)
- **Task**: Fibonacci calculation (fib(30-34))
- **Iterations**: 5-8 parallel tasks
- **Measurement**: Operations per second (higher is better)

## Results

### Heavy Computation (Fibonacci)

| Method | Ops/sec | Avg Time | Improvement |
|--------|---------|----------|-------------|
| Main Thread | 12.45 | 401.23ms | baseline |
| Single Worker | 11.89 | 420.15ms | -4.5% |
| Worker Pool (4x) | 38.72 | 129.14ms | **+211%** |

### Analysis

**Main Thread**: Blocks UI during computation. Suitable only for light tasks (<50ms).

**Single Worker**: No UI blocking, but no speedup for single task. Overhead from message passing. Best for:
- Keeping UI responsive
- Offloading medium tasks (50-200ms)
- Isolated computations

**Worker Pool (4x)**: Parallel execution across multiple workers. Best for:
- Processing arrays of items
- Image/video processing pipelines
- Batch data transformations
- Any embarrassingly parallel workload

## Running Benchmarks Locally

```bash
npm run benchmark
```

This runs the benchmark suite and outputs results to console and `benchmark/results.json`.

## Benchmark Code

See [`benchmark/heavy-computation.bench.ts`](https://github.com/macrulezru/vue-worker-kit/blob/main/benchmark/heavy-computation.bench.ts) for the full test implementation.

## Recommendations

### When to use Workers

✅ Use workers when:
- Task takes >50ms on main thread
- You need to maintain 60fps UI
- Processing large arrays or binary data
- Multiple independent tasks can run in parallel

❌ Avoid workers when:
- Task is <10ms (overhead exceeds benefit)
- Task requires DOM access
- Frequent small messages needed
- Data can't be transferred efficiently

### When to use Pool

✅ Use worker pool when:
- Processing arrays with `.map()` semantics
- Multiple users trigger same heavy task
- You have multi-core CPU available
- Need concurrency control

❌ Avoid pool when:
- Only one task at a time
- Memory constraints (each worker has overhead)
- Tasks must run sequentially

## Memory Overhead

Each worker consumes approximately:
- **Base memory**: ~2-4 MB per worker
- **Transferable buffers**: Zero-copy (no duplication)
- **Structured clone**: 2x memory during transfer

For pools, consider:
```ts
// Optimal pool size = CPU cores
const pool = createWorkerPool(/* ... */, { 
  size: navigator.hardwareConcurrency // typically 4-8
})
```

## Next Steps

- [Worker Pool Guide](/guide/pool) - Learn how to use pools effectively
- [Transfer & Zero-Copy](/guide/transfer) - Optimize data transfer
- [Streaming Results](/guide/streaming) - Handle large datasets
