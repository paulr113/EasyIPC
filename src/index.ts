import { BrowserWindow, IpcMain, IpcRenderer } from 'electron';

const electron = require('electron');

type ActionFunction = (payload: any, res: Response) => Promise<void> | void;
type Notifier = (res: any) => void;
type Resolver = (res: any) => void;
type Rejecter = (err: any) => void;

interface PendingRequest {
    action: string;
    payload: any;
    notifier: Notifier;
    resolve: Resolver;
    reject: Rejecter;
}

interface Response {
    notify: (msg: any) => void;
    send: (res: any) => void;
    error: (err: any) => void;
}

interface WindowItem {
    window: BrowserWindow;
    name: string;
}

class EasyIPC {
    private actions: Map<string, ActionFunction> = new Map();
    private pendingRequests: Map<string, PendingRequest> = new Map();
    private windows: Map<string, BrowserWindow> = new Map();

    constructor() {
        this.getIpc().on("easyIPCMessage", this.actionHandler.bind(this));
        this.responseHandler();
    }

    addAction(action: string, func: ActionFunction): void {
        if (action && func) this.actions.set(action, func);
    }

    private async actionHandler(event: any, requestId: string, action: string, payload: any, noResponse: boolean) {
        const res = {
            notify: !noResponse ? (msg: any) => event.sender.send("easyIPCResponseNotify", requestId, msg) : () => { },
            send: !noResponse ? (res: any) => event.sender.send("easyIPCResponse", requestId, res) : () => { },
            error: !noResponse ? (err: any) => event.sender.send("easyIPCErrorResponse", requestId, err) : () => { }
        };

        const requestedAction = this.actions.get(action);

        if (!requestedAction) {
            console.error(`Action ${action} not defined!`);
            return;
        }

        try {
            const promise = requestedAction(payload, res);

            if (promise instanceof Promise) {
                try {
                    await promise;
                } catch (err) {
                    console.error(err);
                    res.error({ error: err instanceof Error ? err.toString() : JSON.stringify(err) });
                }
            }
        } catch (error) {
            console.error(error);
            res.error({ error: error instanceof Error ? error.toString() : JSON.stringify(error) });
        }
    }

    send({ action, payload, noResponse = false, notifier, windowName }: { action: string, payload: any, noResponse?: boolean, notifier?: Notifier, windowName?: string }): Promise<any> | void {
        const requestId = this.randomId();

        this.sendToWindow(requestId, action, payload, noResponse, windowName);

        if (!noResponse) {
            return new Promise((resolve, reject) => {
                notifier = notifier || (() => {
                    console.warn(`No notifier defined for the request: ${action}:${requestId}`);
                });

                this.pendingRequests.set(requestId, { action, payload, notifier, resolve, reject });
            });
        }
    }

    private sendToWindow(requestId: string, action: string, payload: any, noResponse: boolean, windowName?: string): void {
        if (electron.ipcRenderer) {
            electron.ipcRenderer.send("easyIPCMessage", requestId, action, payload, noResponse);
        } else {
            let windows: IterableIterator<BrowserWindow>;

            if (windowName) {
                windows = ([this.windows.get(windowName)].filter(Boolean) as BrowserWindow[]).values();
            } else {
                windows = this.windows.values();
            }

            for (const window of windows) {
                try {
                    window.webContents.send("easyIPCMessage", requestId, action, payload, noResponse);
                } catch (error) {
                    if ((error as Error).message === "Object has been destroyed") {
                        this.windows = new Map(Array.from(this.windows).filter(([name, win]) => !win.isDestroyed()));
                    } else {
                        throw error;
                    }
                }
            }
        }
    }

    private responseHandler(): void {
        const ipc = this.getIpc();

        ipc.on("easyIPCResponseNotify", this.handleNotify.bind(this));

        ipc.on("easyIPCResponse", this.handleResponse.bind(this));

        ipc.on("easyIPCErrorResponse", this.handleError.bind(this));
    }

    private handleNotify(event: any, requestId: string, res: any): void {
        const pendingRequest = this.pendingRequests.get(requestId);
        if (pendingRequest) {
            pendingRequest.notifier(res);
        }
    }

    private handleResponse(event: any, requestId: string, res: any): void {
        const pendingRequest = this.pendingRequests.get(requestId);
        if (pendingRequest) {
            this.pendingRequests.delete(requestId);
            pendingRequest.resolve(res);
        }
    }

    private handleError(event: any, requestId: string, err: any): void {
        const pendingRequest = this.pendingRequests.get(requestId);
        if (pendingRequest) {
            this.pendingRequests.delete(requestId);
            pendingRequest.reject(err);
        }
    }


    registerWindow({ window, name }: WindowItem): void {
        if (!this.windows.has(name) && window && name) {
            this.windows.set(name, window);
        }
    }

    removeWindow({ window, name }: WindowItem): void {
        if (window) {
            this.windows.delete(name);
        } else if (name) {
            this.windows.delete(name);
        }
    }

    getWindowByName(name: string): BrowserWindow | undefined {
        return this.windows.get(name);
    }

    private randomId(): string {
        return `${Date.now().toString(36)}${Math.random().toString(36).substr(2, 5)}`;
    }

    private getIpc(): IpcRenderer | IpcMain {
        return electron.ipcRenderer || electron.ipcMain;
    }
}

export = EasyIPC;