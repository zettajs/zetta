var crypto = require('crypto');
var EventEmitter = require('events').EventEmitter;
var http = require('http');
var https = require('https');
var url = require('url');
var util = require('util');
var revolt = require('revolt');

var WebSocket = module.exports = function(address, httpOptions) {
  EventEmitter.call(this);

  this.options = {
    method: 'GET',
    headers: {
      'Connection': 'Upgrade',
      'Upgrade': 'websocket',
      'Sec-WebSocket-Version': '13',
    }
  };

  this.isClosed = false;

  var self = this;
  if (httpOptions) {
    for (k in httpOptions) {
      self.options[k] = httpOptions[k];
    }
  }

  this.setAddress(address);

  this.request = revolt();

  var self = this;
  this.onClose = function() {
    self.emit('close');
  };
};

util.inherits(WebSocket, EventEmitter);

WebSocket.prototype.setAddress = function(address) {
  if (address.substr(0, 2) === 'ws') {
    address = 'http' + address.substr(2);
  }

  this.options.uri = address;
  var parsed = url.parse(address);
  this.options.headers['Host'] = parsed.host;
};

WebSocket.prototype.close = function() {
  if (this.isClosed) {
    return;
  }

  this.isClosed = true;
  this.socket.removeListener('close', this.onClose);
  if(this.socket) {
    this.socket.end();   
    this.emit('close', null, null, true);
  } 
};

WebSocket.prototype.start = function() {
  var key = new Buffer('13' + '-' + Date.now()).toString('base64');
  var shasum = crypto.createHash('sha1');
  shasum.update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
  var expectedServerKey = shasum.digest('base64');

  this.options.headers['Sec-WebSocket-Key'] = key;

  var self = this;
  var subscription = this.request
    .request(self.options)
    .subscribe(function(env) {
       var serverKey = env.response.headers['sec-websocket-accept'];
       if (typeof serverKey == 'undefined' || serverKey !== expectedServerKey) {
         self.emit('error', 'invalid server key');
         return;
       }

       self.socket = env.request.connection;
       env.request.connection.on('close', function() {
         self.onClose();
         env.request.abort();
         subscription.dispose();
       });
       self.emit('open', env.request.connection);
    }, function(err) {
      self.emit('error', err);
    });
};
