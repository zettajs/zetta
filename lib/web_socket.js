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
  this._requestExtensions = [];
  this._responseExtensions = [];

  var self = this;
  if (httpOptions) {
    for (var k in httpOptions) {
      self.options[k] = httpOptions[k];
    }
  }

  this.setAddress(address);

  this.request = revolt();
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

WebSocket.prototype.extendRequest = function(extensions) {
  this._requestExtensions = extensions;
};

WebSocket.prototype.extendResponse = function(extensions) {
  this._responseExtensions = extensions;
};

WebSocket.prototype.close = function() {
  if (this.isClosed) {
    return;
  }

  this.isClosed = true;
  if(this.socket) {
    this.socket.end();
//    this.emit('close', null, null, true);
  } 
};

WebSocket.prototype.start = function() {
  var key = new Buffer('13' + '-' + Date.now()).toString('base64');
  var shasum = crypto.createHash('sha1');
  shasum.update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
  var expectedServerKey = shasum.digest('base64');

  this.options.headers['Sec-WebSocket-Key'] = key;

  var self = this;
  var req = this.request;

  this._requestExtensions.forEach(function(ext) {
    ext(req);
  });

  req = req.request(self.options);

  this._responseExtensions.forEach(function(ext) {
    req = ext(req);
  });

  var subscription = req.subscribe(function(env) {
    // Handle non 101 response codes with clearer message
    if (env.response.statusCode !== 101) {
      self.emit('error', 'server returned ' + env.response.statusCode);
      return;
    }

    var serverKey = env.response.headers['sec-websocket-accept'];
    if (typeof serverKey == 'undefined' || serverKey !== expectedServerKey) {
      self.emit('error', 'invalid server key');
      return;
    }
    
    self.isClosed = false;
    self.socket = env.request.connection;
    self.socket.on('close', function() {
      self.emit('close');
      env.request.abort();
      subscription.dispose();
    });
    self.emit('open', env.request.connection);
  }, function(err) {
    self.emit('error', err);
  });
};
