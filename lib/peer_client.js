var EventEmitter = require('events').EventEmitter;
var path = require('path');
var util = require('util');
var uuid = require('node-uuid');
var Logger = require('./logger');
var WebSocket = require('./web_socket');

var RETRY_INTERVAL = 3000;
var RETRY_MAX = 9;
var CONNECTION_BACKOFF_MAX = 50;

function backoffTime() {
  return Math.floor(0 + CONNECTION_BACKOFF_MAX * Math.random());
}

var PeerClient = module.exports = function(url, server) {
  this.url = url.replace(/^http/, 'ws') + '/peers/' + server.id;
  this.server = server.httpServer.spdyServer;
  this.connected = false;
  this.interval = null;
  this.retryCount = 0;
  this._firstConnect = true;
  this.log = server.log || new Logger();
  
  // create a unique connection id peer connection, used to associate initiaion request
  this.connectionId = null;

  EventEmitter.call(this);
};
util.inherits(PeerClient, EventEmitter);

PeerClient.prototype.start = function() {
  setTimeout(this._createSocket.bind(this), (this._firstConnect) ? 0 : backoffTime());
};

PeerClient.prototype.checkServerReq = function() {
  var self = this;
  // /_initiate_peer/{connection-id}
  this.onRequest = function(req, res) {
    if (req.url === '/_initiate_peer/' + self.connectionId) {
      // set up exchange of reactive queries.
      setTimeout(function(){
        self.connected = true;
        self.emit('connected');
        self.log.emit('log', 'peer-client', 'Peer connection established (' + self.url + ')');

        res.statusCode = 200;
        res.end();

        // remove request listener
        self.server.removeListener('request', self.onRequest);

      }, 4000);

    }
  };

  this.server.on('request', this.onRequest);
};

PeerClient.prototype._createSocket = function() {
  var self = this;
  this._firstConnect = false;

  // create a new connection id
  this.connectionId = uuid.v4();
  var ws = new WebSocket(this.url + "?connectionId=" + this.connectionId, {});
  ws.on('open', function(socket) {
    self.checkServerReq();
    self.emit('connecting');  
    self.server.emit('connection', socket);
    self.log.emit('log', 'peer-client', 'WebSocket to peer established (' + self.url + ')');
  });

  ws.on('error', function(err) {
    self.connected = false;
    self.log.emit('log', 'peer-client', 'Peer connection error (' + self.url + '): ' + err);
    reconnect(err);
  });

  ws.on('close', function(code, message) {
    self.connected = false;
    self.log.emit('log', 'peer-client', 'Peer connection closed (' + self.url + '): ' + code + ' - ' + message);
    self.emit('closed', reconnect);
  });

  function reconnect(err) {
    if (self.interval) {
      clearInterval(self.interval);
    }
    
    if (self.retryCount >= RETRY_MAX) {
      self.log.emit('log', 'peer-client', 'Peer connection closed, retry limit reached (' + self.url + ')');
      return self.emit('error', err || new Error('Peer connection closed.'));
    }

    self.retryCount++;

    self.interval = setInterval(function() {
      if (self.connected) {
        clearInterval(self.interval);
      } else {
        self._createSocket(self.url, self.server);
      }
    }, RETRY_INTERVAL);
  }
};
