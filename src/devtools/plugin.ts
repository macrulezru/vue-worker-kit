import type { App } from 'vue'

declare global {
  interface Window {
    __VUE_DEVTOOLS_GLOBAL_HOOK__?: {
      on: (event: string, handler: (...args: unknown[]) => void) => void
      emit: (event: string, ...args: unknown[]) => void
    }
  }
}

export interface DevtoolsPluginOptions {
  /** Plugin name shown in devtools */
  name?: string
  /** Enable timeline events */
  enableTimeline?: boolean
}

/**
 * Registers vue-worker-kit as a native Vue Devtools plugin.
 * Provides timeline traces and inspectable state for worker activities.
 */
export function registerDevtoolsPlugin(app: App, options: DevtoolsPluginOptions = {}): void {
  const hook = window.__VUE_DEVTOOLS_GLOBAL_HOOK__
  if (!hook) {
    console.warn('[vue-worker-kit] Vue Devtools not detected')
    return
  }

  const pluginId = 'vue-worker-kit'
  const name = options.name ?? 'Vue Worker Kit'
  const enableTimeline = options.enableTimeline ?? true

  // Store worker activity data
  const workerActivities = new Map<string, {
    id: string
    status: 'idle' | 'running' | 'error'
    startTime: number | null
    endTime: number | null
    duration: number | null
    error?: string
  }>()

  // Emit timeline event
  function emitTimelineEvent(event: {
    time: number
    title: string
    subtitle?: string
    color?: number
    data?: Record<string, unknown>
  }): void {
    if (!enableTimeline || !hook) return
    hook.emit?.('timeline:event', {
      time: event.time,
      title: event.title,
      subtitle: event.subtitle,
      color: event.color ?? 0x42b883, // Vue green
      data: event.data,
    })
  }

  // Listen for worker activity events
  hook.on?.('worker:activity' as never, ((...args: unknown[]) => {
    const activity = args[0] as {
      type: 'taskStart' | 'taskEnd' | 'taskError'
      workerId: string
      data?: Record<string, unknown>
    }
    const now = Date.now()

    switch (activity.type) {
      case 'taskStart': {
        workerActivities.set(activity.workerId, {
          id: activity.workerId,
          status: 'running',
          startTime: now,
          endTime: null,
          duration: null,
        })
        emitTimelineEvent({
          time: now,
          title: 'Worker Task Started',
          subtitle: `Worker: ${activity.workerId}`,
          data: activity.data,
        })
        break
      }
      case 'taskEnd': {
        const activityData = workerActivities.get(activity.workerId)
        if (activityData && activityData.startTime) {
          const duration = now - activityData.startTime
          workerActivities.set(activity.workerId, {
            ...activityData,
            status: 'idle',
            endTime: now,
            duration,
          })
          emitTimelineEvent({
            time: now,
            title: 'Worker Task Completed',
            subtitle: `Worker: ${activity.workerId}`,
            color: 0x42b883,
            data: { ...activity.data, duration },
          })
        }
        break
      }
      case 'taskError': {
        const activityData = workerActivities.get(activity.workerId)
        if (activityData) {
          workerActivities.set(activity.workerId, {
            ...activityData,
            status: 'error',
            endTime: now,
            error: activity.data?.message as string,
          })
          emitTimelineEvent({
            time: now,
            title: 'Worker Task Error',
            subtitle: `Worker: ${activity.workerId}`,
            color: 0xff5252, // Red
            data: activity.data,
          })
        }
        break
      }
    }
  }) as (...args: unknown[]) => void)

  // Add custom inspector for worker pool stats
  hook.on?.('getInspectorTree' as never, ((...args: unknown[]) => {
    const payload = args[0] as { inspectorId: string; filter: string; rootNodes?: Array<{ id: string; label: string; tags?: Array<{ label: string; textColor: number; backgroundColor: number }> }> }
    if (payload.inspectorId !== pluginId) return
    // Return list of active workers
    payload.rootNodes = Array.from(workerActivities.values()).map((activity) => ({
      id: activity.id,
      label: `Worker ${activity.id}`,
      tags: [{
        label: activity.status.toUpperCase(),
        textColor: activity.status === 'error' ? 0xffffff : 0x000000,
        backgroundColor: activity.status === 'error' ? 0xff5252 : activity.status === 'running' ? 0x42b883 : 0x909399,
      }],
    }))
  }) as (...args: unknown[]) => void)

  hook.on?.('getInspectorState' as never, ((...args: unknown[]) => {
    const payload = args[0] as { inspectorId: string; nodeId: string; state?: Record<string, Array<{ key: string; value: unknown; editable: boolean }>> }
    if (payload.inspectorId !== pluginId) return
    const activity = workerActivities.get(payload.nodeId)
    if (activity) {
      payload.state = {
        'Status': [
          { key: 'status', value: activity.status, editable: false },
          { key: 'startTime', value: activity.startTime, editable: false },
          { key: 'endTime', value: activity.endTime, editable: false },
          { key: 'duration', value: activity.duration ? `${activity.duration}ms` : null, editable: false },
        ],
        'Error': activity.error ? [{ key: 'message', value: activity.error, editable: false }] : [],
      }
    }
  }) as (...args: unknown[]) => void)

  console.log(`[vue-worker-kit] Devtools plugin "${name}" registered`)
}
