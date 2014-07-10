var util = require('util');
var EventEmitter = require('events').EventEmitter;
var EventSocket = module.exports = function(ws, topic) {
  EventEmitter.call(this);
  this.ws = ws;
  this.topic = topic;
  
  this.init();
};
util.inherits(EventSocket, EventEmitter);

EventSocket.prototype.send = function(data) {
  this.ws.send(data, function(err) {
  });
};

EventSocket.prototype.onData = function(data) {
  // @todo handle remote devices publishing data on the websocket
  this.emit('data', data);
};

EventSocket.prototype.onClose = function() {
  this.emit('close');
};

EventSocket.prototype.init = function() {
  var self = this;
  this.ws.on('message', this.onData.bind(this));
  this.ws.on('close', this.onClose.bind(this));
  this.ws.on('error',function(err){
    console.error('ws error:', err);
    self.onClose();
  });
};
