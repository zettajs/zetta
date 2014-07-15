// to test, first start IHeardThat example node sample/IHeardDat/index.js

var fs = require('fs');
var websocket = require('websocket-stream')
var ws = websocket('ws://localhost:3000/servers/d7fe2c66-db23-4513-a5f5-a2a890d1af36/devices/0b335a88-35f8-49d9-b737-81f6456bf938/somevar');

var file = fs.createWriteStream('./some.dat');
ws.pipe(file);
