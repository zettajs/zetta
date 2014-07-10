var pubsub = require('./pubsub_service');

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
  this.subscriptionCounts[topic]++;

  // subscribe locally.
  pubsub.subscribeLocal(topic, this._onLocalPubsub.bind(this));
  
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
  pubsub.unsubscribe(topic);
};

function topicMatch(a, b) {
  return a === b;
}

EventBroker.prototype._publish = function(topic, data) {
  this.clients.forEach(function(client) {
    if (!topicMatch(topic, client.topic)) {
      return;
    }
    client.send(data);
  });
};

EventBroker.prototype._onLocalPubsub = function(topic, data) {

  // @todo cleanup pubsub_service to format data properly  
  var d = data;
  try {
    d = JSON.parse(data);
  } catch(d) {
    d = data;
  }
  
  var json = {
    date: new Date().getTime(),
    topic: topic,
    data: d
  };

  this._publish(topic, JSON.stringify(json));
};



