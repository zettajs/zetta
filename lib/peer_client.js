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

function calculatePeerUrl(url, name){
 var wsUrl = url.replace(/^http/, 'ws');
  var peerPath = '/peers/' + name;
  if(wsUrl.indexOf('/', wsUrl.length - 1) === -1)  {
    wsUrl = wsUrl + peerPath;
  } else {
    wsUrl = wsUrl.slice(0, wsUrl.length - 1) + peerPath;
  } 
  return wsUrl;
}


var PeerClient = module.exports = function(url, server) {
  var wsUrl = calculatePeerUrl(url, server._name); 
  this.reconnect = {
    min: 100,
    max: 30000, // max amount of time allowed to backoff
    maxRandomOffset: 1000, // max amount of time
  };

  this.url = wsUrl;

  this.server = server.httpServer.spdyServer;
  this.connected = false;
  this.retryCount = 0;
  this.log = server.log || new Logger();
  this._ws = null;
  this._backoffTimer = null;
  this._stopped = false;

  // create a unique connection id peer connection, used to associate initiaion request
  this.connectionId = null;

  EventEmitter.call(this);
};
util.inherits(PeerClient, EventEmitter);

PeerClient.calculatePeerUrl = calculatePeerUrl;

PeerClient.prototype.start = function() {
  this._createSocket();
};

PeerClient.prototype.close = function() {
  clearTimeout(this._backoffTimer);
  if (this._ws) {
    this._ws.close();
  }
  this._stopped = true;
};

PeerClient.prototype._createSocket = function() {
  var self = this;

  // once peer is closed dont create new socket
  if (this._stopped) {
    return;
  }
  
  var backoff = this.generateBackoff(this.retryCount);
  this._backoffTimer = setTimeout(function(){
    // create a new connection id
    this.connectionId = uuid.v4();
    self._ws = new WebSocket(self.url + '?connectionId=' + self.connectionId, {});
    self._ws.on('open', function(socket) {
      self.checkServerReq();
      self.emit('connecting');  
      self.server.emit('connection', socket);
      self.log.emit('log', 'peer-client', 'WebSocket to peer established (' + self.url + ')');
    });

    self._ws.on('error', function(err) {
      self.connected = false;
      self.log.emit('log', 'peer-client', 'Peer connection error (' + self.url + '): ' + err);
      reconnect(err);
    });

    self._ws.on('close', function(code, message) {
      self.connected = false;
      self.log.emit('log', 'peer-client', 'Peer connection closed (' + self.url + '): ' + code + ' - ' + message);
      self.emit('closed');
      reconnect();
    });
  }, backoff);

  function reconnect(err) {
    self.retryCount++;
    self._createSocket();
  }
};

PeerClient.prototype.close = function() {
  this.ws.close();
};

PeerClient.prototype.close = function() {
  this.ws.close();
};

PeerClient.prototype.checkServerReq = function() {
  var self = this;

  // remove any previous request listeners
  if (self.onRequest) {
    this.server.removeListener('request', self.onRequest);
  }

  // /_initiate_peer/{connection-id}
  this.onRequest = function(req, res) {
    if (req.url === '/_initiate_peer/' + self.connectionId) {
      self.connected = true;
      self.retryCount = 0;
      self.emit('connected');
      self.log.emit('log', 'peer-client', 'Peer connection established (' + self.url + ')');
      
      res.statusCode = 200;
      res.end();

      // remove request listener
      self.server.removeListener('request', self.onRequest);

      // set up exchange of reactive queries.
    }
  };

  this.server.on('request', this.onRequest);
};

PeerClient.prototype.generateBackoff = function(attempt) {
  if (attempt === 0) {
    return 0;
  }
  
  var random = parseInt(Math.random() * this.reconnect.maxRandomOffset);
  var backoff = (Math.pow(2, attempt) * this.reconnect.min);
  if (backoff > this.reconnect.max) {
    return this.reconnect.max + random;
  } else {
    return backoff + random;
  }
};
