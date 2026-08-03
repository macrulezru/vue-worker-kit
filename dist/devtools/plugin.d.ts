import type { App } from 'vue';
declare global {
    interface Window {
        __VUE_DEVTOOLS_GLOBAL_HOOK__?: {
            on: (event: string, handler: (...args: unknown[]) => void) => void;
            emit: (event: string, ...args: unknown[]) => void;
        };
    }
}
export interface DevtoolsPluginOptions {
    /** Plugin name shown in devtools */
    name?: string;
    /** Enable timeline events */
    enableTimeline?: boolean;
}
/**
 * Registers vue-worker-kit as a native Vue Devtools plugin.
 * Provides timeline traces and inspectable state for worker activities.
 */
export declare function registerDevtoolsPlugin(app: App, options?: DevtoolsPluginOptions): void;
//# sourceMappingURL=plugin.d.ts.map