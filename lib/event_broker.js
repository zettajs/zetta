function topicMatch(a, b) {
  return a === b;
}

var EventBroker = module.exports = function(zetta) {
  this.peers = {};
  this.zetta = zetta;
  this.clients = [];

  this.subscriptions = {};
  this._peerSubscriptions = {};
};

EventBroker.prototype.peer = function(peer) {
  var self = this;
  this.peers[peer.name] = peer;
  this._peerSubscriptions[peer.name] = this._peerSubscriptions[peer.name] || {};
  // subscribe to topics for interest
  Object.keys(this._peerSubscriptions[peer.name]).forEach(function(topic) {
    peer.removeAllListeners(topic);
    console.log('peer topic:', topic);
    peer.on(topic, function(data) {
      self._publish(topic, data);
    });
    peer.subscribe(topic);
  });
};

EventBroker.prototype.client = function(client) {
  var self = this;
  //client.topic
  this.clients.push(client);

  client.on('close', function() {
    self._unsubscribe(client.query);
    var idx = self.clients.indexOf(client);
    if (idx === -1) {
      return;
    }
    self.clients.splice(idx, 1);
  });

  this._subscribe(client.query);
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
    }

    this.subscriptions[topic].count++;
  } else {

    if (!this._peerSubscriptions[query.name]) {
      this._peerSubscriptions[query.name] = { topic: 0};
    }

    if (!this._peerSubscriptions[query.name][topic]) {
      this._peerSubscriptions[query.name][topic] = 0;
      var peer = this.peers[query.name];
      if (peer) {
        peer.removeAllListeners(topic);
        peer.on(topic, function(data) {
          self._publish(topic, data);
        });
        peer.subscribe(topic);
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
    if (peer) {
      peer.unsubscribe(topic);
      peer.removeAllListeners(topic);
    }
  }
};


EventBroker.prototype._publish = function(topic, data) {
  console.log(topic);
  if (!Buffer.isBuffer(data) && typeof data === 'object') {
    try {
      data = JSON.stringify(data);
    } catch (err) {
      console.error('ws JSON.stringify ', err);
      return;
    }
  }

  this.clients.forEach(function(client) {
    if (!topicMatch(topic, client.query.topic)) {
      return;
    }
    client.send(data, function(err){
      if (err) {
        console.error('ws error: '+err);
      }
    });
  });
};

EventBroker.prototype._onLocalPubsub = function(topic, data) {
  this._publish(topic, data);
};



