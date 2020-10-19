# EasyIPC
Easy Inter Process Communication Wrapper for Electron

Main process:
```js
const  EasyIPC = require("@paulr113/easyipc");
const ipc = new EasyIPC(require("electron")); 

//Add actions
ipc.addAction("test", (payload, res) => {
	console.log("New request: test");
	console.log(payload)
	res.send();
})
```

Render process:
```js
const  EasyIPC = require("@paulr113/easyipc");
const ipc = new EasyIPC(require("electron")); 

ipc.send("test").then((payload) => {
	console.log("Response from main process");
	console.log(payload)
})
```
