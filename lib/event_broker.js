function topicMatch(a, b) {
  return a === b;
}

var EventBroker = module.exports = function(zetta) {
  this.peers = {};
  this.zetta = zetta;
  this.clients = [];

  this.subscriptionCounts = {};
};

EventBroker.prototype.peer = function(peer) {
  this.peers[peer.appName] = peer;
  
  // subscribe to topics for interest
  Object.keys(this.subscriptionCounts).forEach(function(topic) {
    peer.subscribe(topic);
  });
};

EventBroker.prototype.client = function(client) {
  var self = this;
  //client.topic
  this.clients.push(client);

  client.on('close', function() {
    self._unsubscribe(client.topic);
    var idx = self.clients.indexOf(client);
    if (idx === -1) {
      return;
    }
    self.clients.splice(idx, 1);
  });
  this._subscribe(client.topic);
};

EventBroker.prototype._subscribe = function(topic) {
  if (!this.subscriptionCounts[topic]) {
    this.subscriptionCounts[topic] = 0;
  }

  // subscribe locally, only once peer topic
  if (this.subscriptionCounts[topic] === 0) {
    this.zetta.pubsub.subscribe(topic, this._onLocalPubsub.bind(this));
  }

  this.subscriptionCounts[topic]++;
  
  // @todo subscribe to peers that only contain topic query
  Object.keys(this.peers).forEach(function(appname) {
    var peer = this.peers[appname];
    peer.subscribe(topic);
  });
};

EventBroker.prototype._unsubscribe = function(topic) {
  this.subscriptionCounts[topic]--;
  if (this.subscriptionCounts[topic] > 0) {
    return;
  }

  delete this.subscriptionCounts[topic];
  // unsubscribe locally
  this.zetta.pubsub.unsubscribe(topic, this._onLocalPubsub.bind(this));
};

EventBroker.prototype._publish = function(topic, data) {
  this.clients.forEach(function(client) {
    if (!topicMatch(topic, client.topic)) {
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



