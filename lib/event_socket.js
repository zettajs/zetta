var util = require('util');
var EventEmitter = require('events').EventEmitter;
var ObjectStream = require('zetta-streams').ObjectStream;
var EventStreamsParser = require('zetta-events-stream-protocol').Parser;
var StreamTopic = require('zetta-events-stream-protocol').StreamTopic;
var buildDeviceActions = require('./api_formats/siren/device.siren').buildActions;
var deviceFormatter = require('./api_formats/siren/device.siren');
var JSCompiler = require('caql-js-compiler');

//Flag to indicate that we expect data back on teh websocket
//Tracking subscriptions
var EventSocket = module.exports = function(ws, query, streamEnabled) {
  EventEmitter.call(this);
  this.ws = ws;
  this.query = [];
  this._queryCache = {};

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
          message: err.message
        };
        self.ws.send(JSON.stringify(msg));
        return;
      }

      if (topic.pubsubIdentifier() === '') {
        var msg = {
          type: 'error',
          code: 400,
          timestamp: new Date().getTime(),
          topic: msg.topic,
          message: 'Topic must have server and specific topic. Specific topic missing.'
        };
        self.ws.send(JSON.stringify(msg));
        return;
      }

      if(topic.streamQuery && !self._queryCache[topic.streamQuery]) {
        try {
          var compiler = new JSCompiler();
          var compiled = compiler.compile(topic.streamQuery);
          self._queryCache[topic.streamQuery] = compiled;
        } catch(err) {
          var msg = {
            type: 'error', 
            code: 400,
            timestamp: new Date().getTime(),
            topic: msg.topic,
            message: err.message  
          }
          self.ws.send(JSON.stringify(msg));
          return;
        }
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
      self._unsubscribe(msg.subscriptionId, function(err, subscription) {
        if (subscription) { 
          self.emit('unsubscribe', subscription);
        }
      });
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

EventSocket.prototype._unsubscribe = function(subscriptionId, cb) {
  var self = this;
  var foundIdx = -1;
  self._subscriptions.some(function(subscription, idx) {
    if(subscription.subscriptionId === subscriptionId) {
      foundIdx = idx;
      return true;
    }
  });

  if (foundIdx < 0) {
    var msg = {
      type: 'error',
      code: 405,
      timestamp: new Date().getTime(),
      message: (new Error('Unable to unsubscribe from invalid subscriptionId')).message
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

  self.ws.send(JSON.stringify(msg));
  if (typeof cb === 'function') {
    cb(null, subscription);
  }
};

EventSocket.prototype.send = function(topic, data) {
  if (!Buffer.isBuffer(data) && typeof data === 'object') {
    var tmpData = (this.streamEnabled) ? data.data : data;

    if (tmpData['transitions']) {
      // format device logs
      tmpData.actions = buildDeviceActions(tmpData.properties.id, this.ws._env, this.ws._loader, tmpData.transitions);
      delete tmpData.transitions;
      if (this.streamEnabled) {
        data.data = tmpData;
      } else {
        data = tmpData;
      }
    } else if (data['query']) {
      // format device queries
      tmpData = deviceFormatter({ loader: this.ws._loader, env: this.ws._env, model: tmpData.device });
      if (this.streamEnabled) {
        data.data = tmpData;
      } else {
        data = tmpData;
      }
    }

    // used for _peer/connect _peer/disconnect
    if (topic.indexOf('_peer/') === 0 && typeof tmpData.peer === 'object') {
      if (this.streamEnabled) {
        data.data = tmpData.peer.properties();
      } else {
        data = ObjectStream.format(topic, tmpData.peer.properties());
      }
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
