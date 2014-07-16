function topicMatch(a, b) {
  return a === b;
}

var EventBroker = module.exports = function(zetta) {
  this.peers = {};
  this.zetta = zetta;
  this.clients = [];

  this.subscriptions = {};
};

EventBroker.prototype.peer = function(peer) {
  this.peers[peer.appName] = peer;
  
  // subscribe to topics for interest
//  Object.keys(this.subscriptions).forEach(function(topic) {
//    peer.subscribe(topic);
//  });
};

EventBroker.prototype.client = function(client) {
  var self = this;
  //client.topic
  this.clients.push(client);

  client.on('close', function() {
    self._unsubscribe(client.query.topic);
    var idx = self.clients.indexOf(client);
    if (idx === -1) {
      return;
    }
    self.clients.splice(idx, 1);
  });

  this._subscribe(client.query.topic);
};

EventBroker.prototype._subscribe = function(topic) {
  
  if (Array.isArray(topic)) {
    console.log('is array')
  }

  if (!this.subscriptions[topic]) {
    this.subscriptions[topic] = { count: 0, listener: null };
  }
  
  // subscribe locally, only once peer topic
  if (this.subscriptions[topic].count === 0) {
    this.subscriptions[topic].listener = this._onLocalPubsub.bind(this);
    this.zetta.pubsub.subscribe(topic, this.subscriptions[topic].listener);
  }

  this.subscriptions[topic].count++;
  
  // @todo subscribe to peers that only contain topic query
  Object.keys(this.peers).forEach(function(appname) {
    var peer = this.peers[appname];
    peer.subscribe(topic);
  });
};

EventBroker.prototype._unsubscribe = function(topic) {
  this.subscriptions[topic].count--;
  if (this.subscriptions[topic].count > 0) {
    return;
  }
  // unsubscribe locally
  this.zetta.pubsub.unsubscribe(topic, this.subscriptions[topic].listener);  
  delete this.subscriptions[topic];
};

EventBroker.prototype._publish = function(topic, data) {
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



