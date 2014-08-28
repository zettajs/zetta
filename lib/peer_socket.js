var EventEmitter = require('events').EventEmitter;
var util = require('util');
var http = require('http');
var spdy = require('./spdy');
var SpdyAgent = require('./spdy_agent');

var PeerSocket = module.exports = function(ws, appName) {
  EventEmitter.call(this);

  this.ws = ws;
  this.appName = appName; // peers local id
  this.serverId = null; // set after peer registry initializes it from http_server
  this.agent = null;
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
  var self = this;
  if(this.subscriptions.indexOf(stream.url) === -1) {
    stream.connection.end();
  }

  var encoding = stream.headers['x-event-encoding'] || 'json';
  var length = Number(stream.headers['content-length']);
  var data = new Buffer(length);
  var idx = 0;
  stream.on('readable', function() {
    while (d = stream.read()) {
      for (var i=0; i<d.length;i++) {
        data[idx++] = d[i];
      }
    };
  });

  stream.on('error', function(err) {
    console.error('error on push:', err);
  });

  stream.on('end', function() {
    var body = null;
    if (encoding === 'json') {
      try {
        body = JSON.parse(data.toString());
      } catch (err) {
        console.error('PeerSocket push data json parse error', err);
      }
    } else if(encoding === 'buffer') {
      body = data;
    }
    self.emit(stream.url, body);    
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

  var self = this;
  this._pingTimer = setInterval(function() {
    var timeout = setTimeout(function() {
      console.error('PeerSocket PING timeout:', self.appName);
      self.ws.close();
    }, 10 * 1000)

    self.agent.ping(function(err) {
      if (timeout) {
        clearTimeout(timeout);
      }
    });
  }, 10 * 1000);
};

PeerSocket.prototype.subscribe = function(event) {
  if(this.subscriptions.indexOf(event) > -1) {
    return;
  }

  this.subscriptions.push(event);

  var body = new Buffer('topic='+event);
  var opts = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Host': 'fog.argo.cx',
      'Content-Length': body.length,
      'zetta-forwarded-server': this.serverId
    },
    path: '/_pubsub/subscribe',
    agent: this.agent
  };

  var req = http.request(opts);
  req.end(body);
};

PeerSocket.prototype.unsubscribe = function(event) { 
  var idx = this.subscriptions.indexOf(event);
  if(idx > -1) {
    this.subscriptions.splice(idx, 1);
  }

  var body = new Buffer('topic='+event);
  var opts = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Host': 'fog.argo.cx',
      'Content-Length': body.length,
      'zetta-forwarded-server': this.serverId
    },
    path: '/_pubsub/unsubscribe',
    agent: this.agent
  };

  var req = http.request(opts);
  req.end(body);
};
