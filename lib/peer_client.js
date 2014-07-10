var EventEmitter = require('events').EventEmitter;
var path = require('path');
var util = require('util');

var Logger = require('./logger');
var WebSocket = require('./web_socket');

var l = Logger();
var RETRY_INTERVAL = 3000;

var PeerClient = module.exports = function(url, server) {
  this.url = url.replace(/^http/, 'ws') + '/servers/' + server.id;
  this.server = server.httpServer.spdyServer;

  this.connected = false;
  this.interval = null;

  EventEmitter.call(this);
};
util.inherits(PeerClient, EventEmitter);

PeerClient.prototype.start = function() {
  this._createSocket();
};

PeerClient.prototype._createSocket = function() {
  var self = this;
  var ws = new WebSocket(this.url);
  ws.on('open', function(socket) {
    self.connected = true;
    l.emit('log', 'cloud-client', 'Cloud connection established (' + self.url + ')');
    self.emit('connected');
    self.server.emit('connection', socket);
    // set up exchange of device registry data.
  });

  ws.on('error', function(err) {
    self.connected = false;
    l.emit('log', 'cloud-client', 'Cloud connection error (' + self.url + '): ' + err);
    self.emit('error', err);
    reconnect();
  });

  ws.on('close', function() {
    self.connected = false;
    l.emit('log', 'cloud-client', 'Cloud connection closed (' + self.url + ')');
    self.emit('closed');
    reconnect();
  });

  function reconnect() {
    if (self.interval) {
      clearInterval(self.interval);
    }

    self.interval = setInterval(function() {
      if (self.connected) {
        clearInterval(self.interval);
      } else {
        self._createSocket(self.url, self.server);
      }
    }, RETRY_INTERVAL);
  };
};
