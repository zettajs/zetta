const util = require('util');
const EventEmitter = require('events').EventEmitter;
const ObjectStream = require('zetta-streams').ObjectStream;
const EventStreamsParser = require('zetta-events-stream-protocol').Parser;
const StreamTopic = require('zetta-events-stream-protocol').StreamTopic;
const buildDeviceActions = require('./api_formats/siren/device.siren').buildActions;
const deviceFormatter = require('./api_formats/siren/device.siren');
const JSCompiler = require('caql-js-compiler');

//Flag to indicate that we expect data back on teh websocket
//Tracking subscriptions
const EventSocket = module.exports = function(ws, query, options) {
  EventEmitter.call(this);

  if (options === undefined) {
    options = {};
  } 
  
  this.ws = ws;
  this.query = [];
  this._queryCache = {};

  // list of event streams
  this._subscriptions = [];
  this._subscriptionIndex = 0;

  // Flags
  this.streamEnabled = !!(options.streamEnabled);
  this.filterMultiple = !!(options.filterMultiple);

  this.hasBeenSent = function(msg) {
    return this._sendBuffer.add(msg);
  };
  this._sendBuffer = {
    add: function(msg) {
      if (this._buffer.indexOf(msg) >= 0) {
        return true;
      }
      
      if (this._buffer.unshift(msg) > this.max) {
        this._buffer.pop();
      }

      return false;
    },
    max: 50,
    _buffer: []
  };
    

  // only setup parser when using event stream
  if (this.streamEnabled) {
    const self = this;
    this._parser = new EventStreamsParser();
    this._parser.on('error', (err, original) => {
      const msg = {
        type: 'error',
        code: (err.name === 'InvalidTypeError') ? 405 : 400,
        timestamp: new Date().getTime(),
        topic: (typeof original === 'object') ? original.topic : null,
        message: err.message
      };
      self.ws.send(JSON.stringify(msg));
    });

    this._parser.on('ping', msg => {
      var msg = {
        type: 'pong',
        timestamp: new Date().getTime(),
        data: msg.data
      };
      self.ws.send(JSON.stringify(msg));
    });

    this._parser.on('subscribe', msg => {
      const topic = new StreamTopic();
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
          const compiler = new JSCompiler();
          const compiled = compiler.compile(topic.streamQuery);
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

      const subscription = { subscriptionId: ++self._subscriptionIndex, topic: topic, limit: msg.limit };
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

    this._parser.on('unsubscribe', msg => {
      self._unsubscribe(msg.subscriptionId, (err, subscription) => {
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
  const self = this;
  let foundIdx = -1;
  self._subscriptions.some((subscription, idx) => {
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

  const subscription = self._subscriptions.splice(foundIdx, 1)[0];
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
  if (!Buffer.isBuffer(data) && typeof data === 'object' && data !== null) {
    let tmpData = (this.streamEnabled) ? data.data : data;

    if (tmpData !== null) {
      if (tmpData['transitions']) {
        // format device logs
        tmpData.actions = buildDeviceActions(tmpData.properties.id, this.ws._env, this.ws._loader, tmpData.transitions);
        delete tmpData.transitions;
        if (this.streamEnabled) {
          data.data = tmpData;
        } else {
          data = tmpData;
        }
      } else if (tmpData['query']) {
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
        const properties = tmpData.peer.properties();
        if (tmpData.error) {
          properties.error = tmpData.error;
        }

        if (this.streamEnabled) {
          data.data = properties;
        } else {
          data = ObjectStream.format(topic, properties);
        }
      }
    }

    try {
      arguments[1] = JSON.stringify(data);
    } catch (err) {
      console.error('ws JSON.stringify ', err);
      return;
    }
  }

  const args = Array.prototype.slice.call(arguments);
  args.splice(0, 1); // remove topic

  // add callback to args list if it does not have one
  if (args.length < 1 && typeof args[args.length - 1] !== 'function') {
    args.push(err => { });
  }

  this.ws.send(...args);
};

EventSocket.prototype.onClose = function() {
  this.emit('close');
};

EventSocket.prototype.init = function() {
  const self = this;
  this.ws.on('message', buffer => {
    if (self.streamEnabled) {
      self._parser.add(buffer);
    }
  });
  this.ws.on('close', this.onClose.bind(this));
  this.ws.on('error',err => {
    console.error('ws error:', err);
    self.onClose();
  });
};
