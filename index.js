class EasyIPC {

    constructor(electron) {
        this.electron = electron
        this.actions = {};
        this.pendingRequests = {};
        this.windows = [];

        this.getIpc(electron).on("easyIPCMessage", (event, requestId, action, payload, noResponse) => {
            this.actionHandler(event, requestId, action, payload, noResponse)
        })

        this.responseHandler(electron);
    }

    //-----------------------respond-----------------------
    addAction(action, func) {
        if (action != null && func != null) this.actions[action] = func;
    }

    actionHandler(event, requestId, action, payload, noResponse) {
        //console.log("New request: " + action + ":" + requestId);

        const res = {
            notify: !noResponse ? (msg) => event.sender.send("easyIPCResponseNotify", requestId, msg) : () => { },
            send: !noResponse ? (res) => event.sender.send("easyIPCResponse", requestId, res) : () => { },
            error: !noResponse ? (err) => event.sender.send("easyIPCErrorResponse", requestId, err) : () => { }
        }

        if (this.actions[action] == null) return res.error({ error: "Action not implemented (" + action + ")" });

        const requestedAction = this.actions[action];

        if (!requestedAction) {
            console.error("Action " + action + " not defined!");
            return;
        }

        try {
            const promise = requestedAction(payload, res);

            if (this.isPromise(promise)) {
                promise.catch((err) => {
                    console.error(err);
                    res.error({ error: err.toString() });
                })
            }
        } catch (error) {
            console.error(error);
            res.error({ error: error.toString() });
        }

    }

    //-----------------------send-----------------------

    send({ action, payload, noResponse, notifier, windowName }) {
        noResponse = noResponse == null ? false : noResponse;

        const requestId = this.randomId();

        if (this.getProcessType() == "renderer") {
            this.getIpc(this.electron).send("easyIPCMessage", requestId, action, payload, noResponse);
        } else {
            if (windowName != null) {
                let window = this.getWindowByName(windowName);
                try {
                    window.window.webContents.send("easyIPCMessage", requestId, action, payload, noResponse)
                } catch (error) {
                    if (error == "TypeError: Object has been destroyed") {
                        this.windows = this.windows.filter((w) => {
                            return !w.window.isDestroyed();
                        });
                    } else throw error
                }
            } else {
                this.windows.forEach((window) => {
                    try {
                        window.window.webContents.send("easyIPCMessage", requestId, action, payload, noResponse)
                    } catch (error) {
                        if (error == "TypeError: Object has been destroyed") {
                            this.windows = this.windows.filter((w) => {
                                return !w.window.isDestroyed();
                            });
                        } else throw error
                    }
                })
            }
        }

        if (!noResponse) {
            const promise = new EasyPromise();
            notifier = notifier || (() => {
                console.warn("No notifier definded for the request: " + action + ":" + requestId);
            })

            this.pendingRequests[requestId] = { promise, action, payload, notifier };

            return promise.promise;
        } else {
            return;
        }

    }

    responseHandler(electron) {
        const ipc = this.getIpc(electron);

        ipc.on("easyIPCResponseNotify", (event, requestId, res) => {
            const { notifier } = this.pendingRequests[requestId];
            notifier(res);
        })

        ipc.on("easyIPCResponse", (event, requestId, res) => {
            const { promise } = this.pendingRequests[requestId];
            this.removePendingRequestId(requestId);
            promise.resolve(res);
        })

        ipc.on("easyIPCErrorResponse", (event, requestId, err) => {
            const { promise } = this.pendingRequests[requestId];
            this.removePendingRequestId(requestId);
            promise.reject(err);
        })
    }

    removePendingRequestId(requestId) {
        this.pendingRequests = Object.keys(this.pendingRequests)
            .filter(k => k !== requestId)
            .map(k => ({ [k]: this.pendingRequests[k] }))
            .reduce((accumulator, current) => ({ ...accumulator, ...current }), {});
    }

    registerWindow({ window, name }) {
        if (this.getWindowByName(name) == null && window != null && name != null) {
            this.windows.push({ window, name })
        }
    }

    removeWindow({ window, name }) {
        if (window != null) {
            this.windows.forEach((w, i) => {
                if (w.window == window) {
                    this.windows.splice(i, 1);
                }
            })
        } else if (name != null) {
            this.windows.forEach((w, i) => {
                if (w.name == name) {
                    this.windows.splice(i, 1);
                }
            })
        }
    }

    //-----------------------helperFunctions-----------------------

    getWindowByName(name) {
        for (let i = 0; i < this.windows.length; i++) {
            if (this.windows[i].name == name) return this.windows[i];
        }
        return null;
    }

    isPromise(obj) {
        return !!obj && (typeof obj === 'object' || typeof obj === 'function') && typeof obj.then === 'function';
    }

    randomId() {
        return `${Date.now().toString(36)}${Math.random().toString(36).substr(2, 5)}`;
    }

    getIpc(electron) {
        if (process.type == "renderer") {
            return electron.ipcRenderer;
        } else {
            return electron.ipcMain;
        }
    }

    getProcessType(electron) {
        if (process.type == "renderer") {
            return "renderer";
        } else {
            return "backend";
        }
    }

}

class EasyPromise {
    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.reject = reject;
            this.resolve = resolve;
        })
    }
}

module.exports = EasyIPC;