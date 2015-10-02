var util = require('util');
var EventEmitter = require('events').EventEmitter;
var ObjectStream = require('zetta-streams').ObjectStream;
var EventStreamsParser = require('./event_streams_parser');
var StreamTopic = require('./stream_topic');
var buildDeviceActions = require('./api_formats/siren/device.siren').buildActions;
var deviceFormatter = require('./api_formats/siren/device.siren');

//Flag to indicate that we expect data back on teh websocket
//Tracking subscriptions
var EventSocket = module.exports = function(ws, query, streamEnabled) {
  EventEmitter.call(this);
  this.ws = ws;
  this.query = [];

  // list of event streams
  this._subscriptions = [];
  this._subscriptionIndex = 0;
  this.streamEnabled = !!(streamEnabled);

  // only setup parser when using event stream
  if (streamEnabled) {
    var self = this;
    this._parser = new EventStreamsParser();
    this._parser.on('error', function(err, original) {
      var msg = {
        type: 'error',
        code: 400,
        timestamp: new Date().getTime(),
        topic: (typeof original === 'object') ? original.topic : null,
        message: err.message
      };
      self.ws.send(JSON.stringify(msg));
    });

    this._parser.on('subscribe', function(msg) {
      var topic = new StreamTopic();
      try {
        topic.parse(msg.topic);
      } catch(err) {
        var msg = {
          type: 'error',
          code: 400,
          timestamp: new Date().getTime(),
          topic: msg.topic,
          message: err
        };
        self.ws.send(JSON.stringify(msg));
        return;
      }

      var subscription = { subscriptionId: ++self._subscriptionIndex, topic: topic, limit: msg.limit };
      self._subscriptions.push(subscription);

      var msg = {
        type: 'subscribe-ack',
        timestamp: new Date().getTime(),
        topic: msg.topic,
        subscriptionId: subscription.subscriptionId
      };
      self.ws.send(JSON.stringify(msg));
      self.emit('subscribe', subscription);
    });

    this._parser.on('unsubscribe', function(msg) {
      var foundIdx = -1;
      self._subscriptions.some(function(subscription, idx) {
        if(subscription.subscriptionId === msg.subscriptionId) {
          foundIdx = idx;
          return true;
        }
      });

      if (foundIdx < 0) {
        var msg = {
          type: 'error',
          code: 405,
          timestamp: new Date().getTime(),
          message: new Error('Unable to unsubscribe from invalid subscriptionId')
        };
        self.ws.send(JSON.stringify(msg));
        return;
      }

      var subscription = self._subscriptions.splice(foundIdx, 1)[0];
      var msg = {
        type: 'unsubscribe-ack',
        timestamp: new Date().getTime(),
        subscriptionId: subscription.subscriptionId
      };

      self.emit('unsubscribe', subscription);
      self.ws.send(JSON.stringify(msg));
    });
  } else {
    if (!Array.isArray(query)) {
      query = [query];
    }
    this.query = query; // contains .topic, .name
  }

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

EventSocket.prototype.onClose = function() {
  this.emit('close');
};

EventSocket.prototype.init = function() {
  var self = this;
  this.ws.on('message', function(buffer) {
    if (self.streamEnabled) {
      self._parser.add(buffer);
    }
  });
  this.ws.on('close', this.onClose.bind(this));
  this.ws.on('error',function(err){
    console.error('ws error:', err);
    self.onClose();
  });
};
