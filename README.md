# EasyIPC
Easy Inter Process Communication Wrapper for Electron

Install:
```shell
$ npm i @paulr113/easyipc
```

Main process:
```js
const  EasyIPC = require("@paulr113/easyipc");
const ipc = new EasyIPC(require("electron")); 

//Add action
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

//Send request
ipc.send("test").then((payload) => {
	console.log("Response from main process");
	console.log(payload)
})
```
