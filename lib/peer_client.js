var EventEmitter = require('events').EventEmitter;
var path = require('path');
var util = require('util');
var uuid = require('node-uuid');
var Logger = require('./logger');
var WebSocket = require('./web_socket');

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
  this.reconnect = {
    min: 100,
    max: 30000, // max amount of time allowed to backoff
    maxRandomOffset: 1000, // max amount of time
  };

  this.server = server.httpServer.spdyServer;
  this.connected = false;
  this.retryCount = 0;
  this.log = server.log || new Logger();
  this._backoffTimer = null;
  this._stopped = false;

  // keep a copy of zetta server for calculating it's peer name
  this._zetta = server;

  this.updateURL(url);

  // create a unique connection id peer connection, used to associate initiaion request
  this.connectionId = null;
  this.ws = new WebSocket(this._createNewUrl(), {});

  EventEmitter.call(this);
};
util.inherits(PeerClient, EventEmitter);

PeerClient.calculatePeerUrl = calculatePeerUrl;

PeerClient.prototype.updateURL = function(httpUrl) {
  var wsUrl = calculatePeerUrl(httpUrl, this._zetta._name); 
  this.url = wsUrl;
};

PeerClient.prototype._createNewUrl = function() {
  this.connectionId = uuid.v4();
  return this.url + '?connectionId=' + this.connectionId;
};

PeerClient.prototype.properties = function() {
  return {
    url: this.url,
    connectionId: this.connectionId,
  };
};

PeerClient.prototype.start = function() {
  this._stopped = false; // If previously closed, reset stopped flag
  this._createSocket();
};

// Close and stop reconnecting
PeerClient.prototype.close = function() {
  clearTimeout(this._backoffTimer);
  this._stopped = true;
  this.ws.close();
};

PeerClient.prototype._createSocket = function() {
  var self = this;

  if (this.backoffTimer) {
    clearTimeout(this.backoffTimer);
  }

  // once peer is closed dont create new socket
  if (this._stopped) {
    return;
  }
  
  var backoff = this.generateBackoff(this.retryCount);
  this._backoffTimer = setTimeout(function(){
    // create a new connection id
    self.ws.setAddress(self._createNewUrl());
    if (self.retryCount === 0) {
      self.ws.on('open', function onOpen(socket) {
        self.checkServerReq();
        self.emit('connecting');  
        self.server.emit('connection', socket);
        self.log.emit('log', 'peer-client', 'WebSocket to peer established (' + self.url + ')');
      });

      self.ws.on('error', function onError(err) {
        self.connected = false;
        self.log.emit('log', 'peer-client', 'Peer connection error (' + self.url + '): ' + err);
        self.emit('closed');
        reconnect(err);
      });

      self.ws.on('close', function(code, message) {
        //if (self.retryCount > 0) throw new Error('wtf');
        self.connected = false;
        self.log.emit('log', 'peer-client', 'Peer connection closed (' + self.url + '): ' + code + ' - ' + message);
        self.emit('closed');
        reconnect();
      });
    }

    self.ws.start();
  }, backoff);

  function reconnect(err) {
    self.retryCount++;
    self._createSocket();
  }
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
