var EventEmitter = require('events').EventEmitter;
var util = require('util');
var spdy = require('spdy');
var SpdyAgent = require('./spdy_agent');

var PeerSocket = module.exports = function(ws, appName) {
  EventEmitter.call(this);

  this.ws = ws;
  this.appName = appName;
  this.agent = null;
  this.eventRequests = {};
  this.subscriptions = [];
  this._pingTimer = null;

  this.init();
};
util.inherits(PeerSocket, EventEmitter);

PeerSocket.prototype.onEnd = function() {
  var self = this;
  setTimeout(function() {
    if (!self.ws._socket) {
      self.emit('end');
    }
  }, 5 * 60 * 1000);
};

PeerSocket.prototype.onPushData = function(stream) {
  stream.connection.end();
  return;
  // currently ignore push data from peer
  
  if (!self.subscriptions[stream.url] && !self._collectors[stream.url]) {
    stream.connection.end();
    return;
  }

  var data = [];
  var len = 0;
  stream.on('readable', function() {
    while (d = stream.read()) {
      data.push(d);
      len += d.length;
    };
  });

  stream.on('error', function(err) {
    console.error('error on push:', err);
  });

  stream.on('end', function() {
    if (!self.peers.length) {
      stream.connection.end();
      return;
    }
    
    if (!self.subscriptions[stream.url] && !self._collectors[stream.url]) {
      stream.connection.end();
      return;
    }

    var queueName = stream.url;
    var body = data.join();
    self._publish(queueName, body);
    stream.connection.end();
  });
};

PeerSocket.prototype.init = function() {
  var self = this;

  this.ws._socket.removeAllListeners('data'); // Remove WebSocket data handler.
  this.ws._socket.on('end', this.onEnd.bind(this));

  this.agent = spdy.createAgent(SpdyAgent, {
    host: this.appName,
    port: 80,
    socket: this.ws._socket,
    spdy: {
      plain: true,
      ssl: false
    }
  });

  // TODO: Remove this when bug in agent socket removal is fixed.
  this.agent.maxSockets = 150;
  this.agent.on('push', this.onPushData.bind(this));
  // subscribe to all prev subscriptions
  this.subscriptions.forEach(this.subscribe.bind(this));
  
  if(this._pingTimer) {
    clearInterval(this._pingTimer);
  }
  this._pingTimer = setInterval(function() {
    self.agent.ping(function(err) {
      //TODO: Handle a lack of PONG.
    });
  }, 10 * 1000);
};

PeerSocket.prototype.subscribe = function(event) {
  if(this.subscriptions.indexOf(event) === -1) {
    this.subscriptions.push(event);
  }

  var body = new Buffer('name='+event);
  var opts = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Host': 'fog.argo.cx',
      'Content-Length': body.length
    },
    path: '/_subscriptions',
    agent: this.agent
  };

  var req = http.request(opts);
  req.end(body);
  this.eventRequests[event] = req;
};

