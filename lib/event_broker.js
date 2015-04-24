var querytopic = require('./query_topic');

function topicMatch(a, b) {
  return a === b;
}

var EventBroker = module.exports = function(zetta) {
  this.peers = {};
  this.zetta = zetta;
  this.clients = [];

  this.subscriptions = {};
  this._peerSubscriptions = {};

  this._publishListeners = {}; // {<server_name>: {<topic>: _listner } }
  this._deviceQueries = {};
};

EventBroker.prototype.peer = function(peer) {
  var self = this;
  this.peers[peer.name] = peer;
  this._peerSubscriptions[peer.name] = this._peerSubscriptions[peer.name] || {};
  // subscribe to topics for interest
  Object.keys(this._peerSubscriptions[peer.name]).forEach(function(topic) {
    self._setupPublishListener(peer, topic);
  });
};

EventBroker.prototype._setupPublishListener = function(peer, topic) {
  var self = this;

  if (!this._publishListeners[peer.name]) {
    this._publishListeners[peer.name] = {};
  }
  
  if (this._publishListeners[peer.name][topic]) {
    return;
  }

  this._publishListeners[peer.name][topic] = function(data) {
    self._publish(topic, data);
  };

  peer.on(topic, this._publishListeners[peer.name][topic]);
  peer.subscribe(topic);
};

EventBroker.prototype.client = function(client) {
  var self = this;
  var c = this.clients.filter(function(cl) {
    if (client.query.length !== cl.query.length) {
      return null;
    }

    var stillValid = true;
    for (var i = 0; i < client.query.length; i++) {
      if (!cl.query[i]) {
        stillValid = false;
        break;
      }

      var clq = querytopic.parse(cl.query[i].topic);
      var clientq = querytopic.parse(client.query[i].topic);

      if ((!clq || !clientq) || clq.ql !== clientq.ql || cl.query[i].name !== client.query[i].name) {
        stillValid = false;
      }
    }

    return stillValid && client.ws === cl.ws;
  });

  if (c.length > 0) {
    return;
  }

  this.clients.push(client);

  client.on('close', function() {
    client.query.forEach(self._unsubscribe.bind(self));
    var idx = self.clients.indexOf(client);
    if (idx === -1) {
      return;
    }
    self.clients.splice(idx, 1);
  });
  client.query.forEach(this._subscribe.bind(this));
};

EventBroker.prototype._subscribe = function(query) {
  var self = this;
  var topic = query.topic;

  // is local
  if (query.name === this.zetta.id) {
    if (!this.subscriptions[topic]) {
      this.subscriptions[topic] = { count: 0, listener: null };
    }

    // subscribe locally, only once peer topic
    if (this.subscriptions[topic].count === 0) {
      this.subscriptions[topic].listener = this._onLocalPubsub.bind(this);
      this.zetta.pubsub.subscribe(topic, this.subscriptions[topic].listener);

      // subscribe to local
      if (querytopic.isQuery(topic)) {
        this.subscribeToDeviceQuery(topic);
      }
    }

    this.subscriptions[topic].count++;
  } else {

    if (!this._peerSubscriptions[query.name]) {
      this._peerSubscriptions[query.name] = {};
    }

    if (!this._peerSubscriptions[query.name][topic]) {
      this._peerSubscriptions[query.name][topic] = 0;
      var peer = this.peers[query.name];
      if (peer) {
        this._setupPublishListener(peer, topic);
      }
    }
    this._peerSubscriptions[query.name][topic]++;
  }
};

EventBroker.prototype._unsubscribe = function(query) {
  var topic = query.topic;

  if (query.name === this.zetta.id) {
    this.subscriptions[topic].count--;
    if (this.subscriptions[topic].count > 0) {
      return;
    }
    // unsubscribe locally
    this.zetta.pubsub.unsubscribe(topic, this.subscriptions[topic].listener);
    delete this.subscriptions[topic];

    if (this._deviceQueries[topic]) {
      this._deviceQueries[topic].dispose();
      delete this._deviceQueries[topic];
    }
  } else {
    if (!this._peerSubscriptions[query.name]) {
      this._peerSubscriptions[query.name] = { topic: 1};
    }

    this._peerSubscriptions[query.name][topic]--;
    if (this._peerSubscriptions[query.name][topic] > 0) {
      return;
    }

    delete this._peerSubscriptions[query.name][topic];

    var peer = this.peers[query.name];

    if (this._publishListeners[query.name] &&
        this._publishListeners[query.name][topic]) {

      if (peer) {
        peer.removeListener(topic, this._publishListeners[query.name][topic]);
      }

      delete this._publishListeners[query.name][topic];
    }

    if (peer) {
      peer.unsubscribe(topic);
    }
  }
};


EventBroker.prototype._publish = function(topic, data) {
  this.clients.forEach(function(client) {
    client.query.forEach(function(query) {
      if (!topicMatch(topic, query.topic)) {
        return;
      }

      client.send(topic, data, function(err){
        if (err) {
          console.error('ws error: '+err);
        }
      });
    });
  });
};

EventBroker.prototype._onLocalPubsub = function(topic, data) {
  this._publish(topic, data);
};


EventBroker.prototype.subscribeToDeviceQuery = function(topic) {
  if (this._deviceQueries[topic]) {
    return;
  }

  var qt = querytopic.parse(topic);
  var self = this;
  var q = self.zetta.runtime.query().ql(qt.ql);
  this._deviceQueries[topic] = this.zetta.runtime.observe(q, function(device) {
    self.zetta.pubsub.publish(topic, { query: topic, device: device });
  });
};
