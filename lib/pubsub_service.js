const EventEmitter = require('events').EventEmitter;
const StreamTopic = require('zetta-events-stream-protocol').StreamTopic;
const ObjectStream = require('zetta-streams').ObjectStream;
const deviceFormatter = require('./api_formats/siren/device.siren');

function socketFdFromEnv(env) {
  if (env.request && env.request.connection && env.request.connection.socket && env.request.connection.socket._handle) {
    return env.request.connection.socket._handle.fd;
  } else {
    return null;
  }
}

const PubSub = module.exports = function() {
  this.emitter = new EventEmitter();

  // Keep from warning poping up
  this.emitter.setMaxListeners(Infinity);

  this._listeners = {};
  
  // sendcache ensures only one event is sent to cloud connection for a topic subscription
  // this can happen now because of wildcards and regexes in topics
  this._sendCache = {}; // { <socketFd>: [event1, event2, ... ] }
  this._maxCacheSize = 100; // keep list of last 100 events per peer connection
};

PubSub.prototype.publish = function(topic, data, fromRemote) {
  fromRemote = !!(fromRemote);
  const x = decodeURIComponent(topic);
  this.emitter.emit(x, data, fromRemote);
  this.emitter.emit('_data', x, data, fromRemote);
};

PubSub.prototype.subscribe = function(topic, callback) {
  const self = this;
  if (typeof topic === 'string') {
    topic = StreamTopic.parse(topic);
  }

  const f = function(t, data, fromRemote) {
    if (topic.match(t)) {
      if (typeof callback === 'function') {
        self._onCallback(topic, t, data, fromRemote, callback);
      } else if (typeof callback === 'object') {
        // Only send to peer if event did not come from a downstream peer
        if (!fromRemote) {
          self._onResponse(topic, t, data, fromRemote, callback);
        }
      }
    }
  };

  this.emitter.on('_data', f);

  if (!this._listeners[topic.hash()]) {
    this._listeners[topic.hash()] = [];
  }

  this._listeners[topic.hash()].push({ listener: callback, actual: f });
};

PubSub.prototype.unsubscribe = function(topic, listener) {
  if (typeof topic === 'string') {
    topic = StreamTopic.parse(topic);
  }

  if (!this._listeners[topic.hash()]) {
    return;
  }

  let found = -1;
  this._listeners[topic.hash()].some(function(l, idx) {
    if (l.listener === listener) {
      found = idx;
      return true;
    }
  });

  if (found === -1) {
    return;
  }

  if (typeof listener === 'object') {
    const underlyingSocketFd = socketFdFromEnv(listener);
    if (underlyingSocketFd !== null) {
      delete this._sendCache[underlyingSocketFd];
    }
    listener.response.end(); // end response for push request
  }

  this.emitter.removeListener('_data', this._listeners[topic.hash()][found].actual);
  this._listeners[topic.hash()].splice(found, 1);

  if (this._listeners[topic.hash()].length === 0) {
    delete this._listeners[topic.hash()];
  }
};

PubSub.prototype._onCallback = function(topic, sourceTopic, data, fromRemote, cb) {
  const self = this;
  cb(topic, data, sourceTopic, fromRemote);
};


// topic: StreamTopic that was used to subscribe
// sourceTopic: topic string emitted
// data...
// env: argo env for the subscription request
PubSub.prototype._onResponse = function(topic, sourceTopic, data, fromRemote, env) {
  const underlyingSocketFd = socketFdFromEnv(env);
  if (this._sendCache[underlyingSocketFd] === undefined) {
    this._sendCache[underlyingSocketFd] = [];
  }

  if (this._sendCache[underlyingSocketFd].indexOf(data) >= 0) {
    return;
  } else {
    this._sendCache[underlyingSocketFd].push(data);
    if (this._sendCache[underlyingSocketFd].length > this._maxCacheSize) {
      this._sendCache[underlyingSocketFd].shift();
    }
  }
  
  const self = this;
  let encoding = '';
  if(Buffer.isBuffer(data)) {
    encoding = 'application/octet-stream';
  } else if (data.query && data.device) {
    var serverId = env.route.params.serverId;
    const loader = { path: `/servers/${encodeURIComponent(serverId)}` };
    data = deviceFormatter({ loader: loader, env: env, model: data.device });      
    encoding = 'application/json';
    data = new Buffer(JSON.stringify(data));
  } else if (typeof data == 'object') {
    encoding = 'application/json';

    // used for _peer/connect _peer/disconnect
    if (sourceTopic.indexOf('_peer/') === 0 && typeof data.peer === 'object') {
      data = ObjectStream.format(sourceTopic, data.peer.properties());
    }

    try {
      data = new Buffer(JSON.stringify(data));
    } catch (err) {
      console.error(err, err.stack);
      return;
    }
  } else {
    console.error('PubSub._onResponse encoding not set.');
  }
  const stream = env.response.push(`/${sourceTopic}`, { 'Host': `${encodeURIComponent(serverId)}.unreachable.zettajs.io`,
                                                       'Content-Length': data.length,
                                                       'Content-Type': encoding
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

