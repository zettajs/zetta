var EventEmitter = require('events').EventEmitter;
var util = require('util');
var http = require('http');
var url = require('url');
var querystring = require('querystring');
var spdy = require('spdy');
var SpdyAgent = require('./spdy_agent');

var PeerSocket = module.exports = function(ws, appName) {
  EventEmitter.call(this);

  this.ws = ws;
  this.appName = appName; // peers local id
  this.serverId = null; // set after peer registry initializes it from http_server
  this.agent = null;
  this.subscriptions = [];
  this._pingTimer = null;
  this._pingTimeout = 10 * 1000;
  
  this.init();
};
util.inherits(PeerSocket, EventEmitter);

PeerSocket.prototype.close = function() {
  clearInterval(this._pingTimer);
  this.ws.close();
};

PeerSocket.prototype.init = function(ws) {
  var self = this;
  
  if (ws) {
    this.ws = ws;
  }

  this.ws._socket.removeAllListeners('data'); // Remove WebSocket data handler.
  this.ws._socket.on('end', function() {
    clearInterval(self._pingTimer);
    self.emit('end');
  });

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


  // setup connection
  this._setupConnection(function(err) {
    if (err) {
      self.close();
    }
    
    // subscribe to all prev subscriptions
    self.subscriptions.forEach(self.subscribe.bind(self));
    self._startPingTimer();
  });
};

PeerSocket.prototype._setupConnection = function(cb) {
  setImmediate(cb);
};

PeerSocket.prototype._startPingTimer = function() {
  var self = this;
  clearInterval(this._pingTimer);
  this._pingTimer = setInterval(function() {
    var timeout = setTimeout(function() {
      console.error('PeerSocket PING timeout:', self.appName);
      self.close();
    }, self._pingTimeout)

    self.agent.ping(function(err) {
      if (timeout) {
        clearTimeout(timeout);
      }
    });
  }, self._pingTimeout);

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

PeerSocket.prototype.subscribe = function(event, cb) {
  if(!cb) {
    cb = function() {};
  }

  if(this.subscriptions.indexOf(event) > -1) {
    cb();
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

  var req = http.request(opts, function(res) {
    cb();
  });
  req.end(body);
};

PeerSocket.prototype.unsubscribe = function(event, cb) { 
  if(!cb) {
    cb = function() {};
  }

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

  var req = http.request(opts, function(res) {
    cb();
  });
  req.end(body);
};

PeerSocket.prototype.confirmConnection = function(connectionId, callback) { 
  var opts = { agent: this.agent, path: '/_initiate_peer/' + connectionId };
  http.get(opts, function(res) {
    if (res.statusCode !== 200) {
      return callback(new Error('Unexpected status code'));
    }
    callback();
  }).on('error', function(err) {
    callback(err);
  });
};

PeerSocket.prototype.transition = function(action, args, cb) {
  var u = url.parse(action.href);
  var path = u.pathname.replace(this.serverId, this.appName);

  var body = new Buffer(querystring.stringify(args));
  var opts = {
    agent: this.agent,
    path: path,
    method: action.method,
    headers: {
      'zetta-forwarded-server': this.serverId,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Host': 'fog.argo.cx',
      'Content-Length': body.length,
    }
  };
  var req = http.request(opts, function(res) {
    var buffer = [];
    var len = 0;
    res.on('readable', function() {
      var data;
      while (data = res.read()) {
        buffer.push(data);
        len += data.length;
      }
    });

    res.on('end', function() {
      var buf = Buffer.concat(buffer, len);
      if (res.statusCode !== 200) {
        return cb(new Error(buf.toString()));
      }

      var jsonBody = null;
      try {
        jsonBody = JSON.parse(buf.toString());
      } catch(err) {
        return cb(new Error('Failed to parse body'));
      }
      return cb(null, jsonBody);
    });
  });
  req.end(body);
};

