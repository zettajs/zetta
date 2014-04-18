var crypto = require('crypto');
var EventEmitter = require('events').EventEmitter;
var http = require('http');
var url = require('url');
var util = require('util');

var WebSocket = module.exports = function(address) {
  EventEmitter.call(this);

  var parsed = url.parse(address);
  var host = parsed.hostname;
  var port = parsed.port;

  // begin handshake
  var key = new Buffer('13' + '-' + Date.now()).toString('base64');
  var shasum = crypto.createHash('sha1');
  shasum.update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
  var expectedServerKey = shasum.digest('base64');

  var opts = {
    host: host,
    port: port,
    method: 'GET',
    headers: {
      'Connection': 'Upgrade',
      'Upgrade': 'websocket',
      'Host': parsed.host,
      'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Key': key
    }
  };

  var req = http.request(opts);

  var self = this;
  req.on('upgrade', function(res) {
    var serverKey = res.headers['sec-websocket-accept'];
    if (typeof serverKey == 'undefined' || serverKey !== expectedServerKey) {
      self.emit('error', 'invalid server key');
      return;
    }

    req.connection.on('close', function() {
      self.emit('close');
    });

    self.emit('open', req.connection);
  });

  req.on('error', function(e) { self.emit('error', e); });
  req.end();

};
util.inherits(WebSocket, EventEmitter);
