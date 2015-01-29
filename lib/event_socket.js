var util = require('util');
var EventEmitter = require('events').EventEmitter;
var ObjectStream = require('zetta-streams').ObjectStream;
var buildDeviceActions = require('./api_formats/siren/device.siren').buildActions;
var deviceFormatter = require('./api_formats/siren/device.siren');

var EventSocket = module.exports = function(ws, query) {
  EventEmitter.call(this);
  this.ws = ws;

  if (!Array.isArray(query)) {
    query = [query];
  }
  this.query = query; // contains .topic, .name
  this.init();
};
util.inherits(EventSocket, EventEmitter);

EventSocket.prototype.send = function(topic, data) {
  if (!Buffer.isBuffer(data) && typeof data === 'object') {
    if (data['transitions']) {
      // format transitions
      data.actions = buildDeviceActions(data.properties.id, this.ws._env, this.ws._loader, data.transitions);
      delete data.transitions;
    } else if (data['query']){
      data = deviceFormatter({ loader: this.ws._loader, env: this.ws._env, model: data.device });
    }
    
    // used for _peer/connect _peer/disconnect
    if (Object.keys(data).length === 1 && typeof data.peer === 'object') {
      data = ObjectStream.format(topic, data.peer.properties());
    }

    try {
      data = JSON.stringify(data);
    } catch (err) {
      console.error('ws JSON.stringify ', err);
      return;
    }
  }

  var args = Array.prototype.slice.call(arguments);
  args.splice(0, 1); // remove topic

  // add callback to args list if it does not have one
  if (args.length < 1 && typeof args[args.length - 1] !== 'function') {
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
