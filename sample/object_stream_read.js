// to test, first start IHeardThat example node sample/IHeardDat/index.js

var fs = require('fs');
var websocket = require('ws')
var ws = new websocket('ws://localhost:3000/servers/d7fe2c66-db23-4513-a5f5-a2a890d1af36/devices/0b335a88-35f8-49d9-b737-81f6456bf938/amplitude');

ws.on('message', function(buf, flags) {
  var msg = JSON.parse(buf);
  console.log(msg)
});
