var EventEmitter = require('events').EventEmitter;

var PubSub = module.exports = function() {
  this.emitter = new EventEmitter();
  this._listeners = {};
};

PubSub.prototype.publish = function(topic, data) {
  this.emitter.emit(topic, data);
};

PubSub.prototype.subscribe = function(topic, callback) {
  var f = null;
  if (typeof callback === 'function') {
    f = this._onCallback(topic, callback);
    this.emitter.on(topic, f);
  } else if (typeof callback === 'object') {
    f = this._onResponse(topic, callback);
    this.emitter.on(topic, f);
  } else {
    return;
  }

  if (!this._listeners[topic]) {
    this._listeners[topic] = [];
  }
  
  this._listeners[topic].push({ listener: callback, actual: f });
};

PubSub.prototype.unsubscribe = function(topic, listener) {
  if (!this._listeners[topic]) {
    return;
  }
  var found = -1;
  this._listeners[topic].some(function(l, idx) {
    if (l.listener === listener) {
      found = idx;
      return true;
    }
  });

  if (found === -1) {
    return;
  }

  if (typeof listener === 'object') {
    listener.end(); // end response for push request
  }

  this.emitter.removeListener(topic, this._listeners[topic][found].actual);
  this._listeners[topic].splice(found, 1);

  if (this._listeners[topic].length === 0) {
    delete this._listeners[topic];
  }

};

PubSub.prototype._onCallback = function(topic, cb) {
  var self = this;
  return function(data, options) {
    cb(topic, data);
  };
};

PubSub.prototype._onResponse = function(topic, res) {
  var self = this;
  return function(data) {
    var encoding = '';
    if(Buffer.isBuffer(data)) {
      encoding = 'buffer';
    } else if(typeof data == 'object') {
      encoding = 'json';
      try {
        data = new Buffer(JSON.stringify(data));
      } catch (err) {
        return;
      }
    } else {
      console.error('PubSub._onResponse encoding not set.');
    }

    var stream = res.push(topic, { 'Host': 'fog.argo.cx',
                                   'Content-Length': data.length,
                                   'X-Event-Encoding': encoding
                                 });

    stream.on('error', function(err) {
      if (err.code === 'RST_STREAM' && err.status === 3) {
        stream.end();
      } else {
        console.error('PubSub._onCallback', err);
      }
    });

    stream.end(data);
  };
};

