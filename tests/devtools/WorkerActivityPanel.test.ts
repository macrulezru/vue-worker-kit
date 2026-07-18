// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'
import { createWorkerPool } from '../../src/adapters/pool'
import { createWorkerActivityMonitor } from '../../src/devtools/createWorkerActivityMonitor'
import WorkerActivityPanel from '../../src/devtools/WorkerActivityPanel.vue'
import { createTestWorker, type FixtureModule } from '../helpers'

describe('WorkerActivityPanel', () => {
  test('renders live stats and an error after a failed task', async () => {
    const handler = async (input: { fail?: boolean }) => {
      if (input.fail) throw new Error('panel-error')
      return 1
    }
    const pool = createWorkerPool<FixtureModule<{ fail?: boolean }, number>>(
      () => createTestWorker(handler),
      { size: 1 },
    )
    const monitor = createWorkerActivityMonitor(pool)
    const wrapper = mount(WorkerActivityPanel, { props: { monitor } })

    expect(wrapper.text()).toContain('0 busy')
    expect(wrapper.text()).toContain('none')

    await expect(pool.run({ fail: true })).rejects.toThrow()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('panel-error')

    await wrapper.find('button').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('none')
  })
})
