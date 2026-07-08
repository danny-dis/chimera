import { DaemonClient } from './daemon-client';
export declare class StatusBarManager {
    private daemon;
    private daemonStatus;
    private modeStatus;
    private costStatus;
    private updateInterval;
    constructor(daemon: DaemonClient);
    start(): void;
    dispose(): void;
    private update;
}
//# sourceMappingURL=status-bar.d.ts.map