var util = require('util');
var EventEmitter = require('events').EventEmitter;
var buildDeviceActions = require('./api_formats/siren/device.siren').buildActions;

var EventSocket = module.exports = function(ws, query) {
  EventEmitter.call(this);
  this.ws = ws;
  this.query = query; // contains .topic, .serverId

  this.init();
};
util.inherits(EventSocket, EventEmitter);

EventSocket.prototype.send = function() {
  var args = Array.prototype.slice.call(arguments);
  if (!Buffer.isBuffer(args[0]) && typeof args[0] === 'object') {
    if (args[0]['transitions']) {
      var data = args[0];
      // format transitions
      args[0].actions = buildDeviceActions(data.properties.id, this.ws._env, this.ws._loader, data.transitions);
      delete args[0].transitions;
    }
    
    var data = null;
    try {
      data = JSON.stringify(args[0]);
    } catch (err) {
      console.error('ws JSON.stringify ', err);
      return;
    }
    
    args[0] = data;
  }

  // add callback to args list if it does not have one
  if (args.length < 3 && typeof args[args.length - 1] !== 'function') {
    args.push(function(err) { });
  }

  this.ws.send.apply(this.ws, args);
};

EventSocket.prototype.onData = function(data) {
  var args = ['data'].concat(Array.prototype.slice.call(arguments));
  // @todo handle remote devices publishing data on the websocket
  this.emit.apply(this, args);
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
