var JSCompiler = require('caql-js-compiler');
var querytopic = require('./query_topic');
var StreamTopic = require('zetta-events-stream-protocol').StreamTopic;

var EventBroker = module.exports = function(zetta) {
  this.peers = {};
  this.zetta = zetta;
  this.clients = [];

  this.subscriptions = {};

  // List of subscriptions for a peer that has not yet been connected
  this._peerSubscriptions = {}; // { <serverName>: [] }

  this._publishListeners = {}; // {<serverName>: {<topic>: _listner } }
  this._deviceQueries = {};

  this._queryCache = {};
  
  // only used for local pubsub
  this._sendCache = []; // { [event1, event2, ... ] }
  this._maxCacheSize = 100; // keep list of last 100 events per peer connection
};

EventBroker.prototype.peer = function(peer) {
  var self = this;
  this.peers[peer.name] = peer;

  // No awaiting subscriptions for that peer
  if (this._peerSubscriptions[peer.name] === undefined) {
    return;
  }
  // subscribe to topics for that peer
  this._peerSubscriptions[peer.name].forEach(function(topic) {
    self._subscribeToPeer(peer.name, topic);
  });

  delete this._peerSubscriptions[peer.name];
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

  if (client.streamEnabled) {
    this._streamEnabledClient(client);
    return;
  }
  
  var pubsubSubscriptions = [];
  var remoteSubscriptions = [];
  // query: { name: <serverName>, topic: <pubsub topic>}
  client.query.forEach(function(query) {
    var subscriptionTopic = query.topic; 
    if (query.name && query.name !== self.zetta.id) {
      // subscribe through peer socket
      self._subscribeToPeer(query.name, query.topic);
      remoteSubscriptions.push(query);

      // Change subsciptions topic to append <serverName>/<topic> when it comes accross pubsub
      subscriptionTopic = query.name + '/' + query.topic;
    } else {
      // If topic is device query setup an obserable
      if (querytopic.isQuery(subscriptionTopic) && !self._deviceQueries[subscriptionTopic]) {
        var qt = querytopic.parse(subscriptionTopic);
        var q = self.zetta.runtime.query().ql(qt.ql);
        self._deviceQueries[subscriptionTopic] = self.zetta.runtime.observe(q, function(device) {
          // Use setImmediate to ensure pubsub listener is setup before its published
          setImmediate(function() {
            self.zetta.pubsub.publish(subscriptionTopic, { query: subscriptionTopic, device: device });
          });
        });
      }
    }

    var handler = function(topic, data, sourceTopic) {
      client.send(query.topic, data, function(err){
        if (err) {
          console.error('ws error: '+err);
        }
      });
    };
    pubsubSubscriptions.push({ topic: subscriptionTopic, callback: handler });
    self.zetta.pubsub.subscribe(subscriptionTopic, handler);
  });

  client.once('close', function() {
    // Cleanup all local subscriptions
    pubsubSubscriptions.forEach(function(h) {
      self.zetta.pubsub.unsubscribe(h.topic, h.callback)
      // If topic is a device query disposeof it.
      if (self._deviceQueries[h.topic]) {
        self._deviceQueries[h.topic].dispose();
        delete self._deviceQueries[h.topic];
      }
    });

    // Unsubscribe to all remote subscriptions
    remoteSubscriptions.forEach(function(query) {
      self._unsubscribeFromPeer(query.name, query.topic);
    });

    delete pubsubSubscriptions;
    delete remoteSubscriptions;
  });
};


// Subscribe to peer has been conneced. If peer is not connected keep a list of topics for 
// when it does connect.
EventBroker.prototype._subscribeToPeer = function(peerName, topic) {
  var peer = this.peers[peerName];
  if (peer) {
    peer.subscribe(topic);
  } else {
    if (!this._peerSubscriptions[peerName]) {
      this._peerSubscriptions[peerName] = [];
    }
    this._peerSubscriptions[peerName].push(topic);
  }
};

// Unsubscribe from peer if peer has been connected. If not remove topic
// from list of topics.
EventBroker.prototype._unsubscribeFromPeer = function(peerName, topic) {
  var peer = this.peers[peerName];
  if (peer) {
    peer.unsubscribe(topic);
  } else {
    if (this._peerSubscriptions[peerName]) {
      var idx = this._peerSubscriptions[peerName].indexOf(topic);
      if (idx !== -1) {
        this._peerSubscriptions[peerName].splice(idx, 1);
      }
      if (this._peerSubscriptions[peerName].length === 0) {
        delete this._peerSubscriptions[peerName];
      }
    }
  }
};

EventBroker.prototype._streamEnabledClient = function(query) {
  return;
  function generateQuery(topic) {
    return {
      name: topic.serverName(),
      topic: topic.pubsubIdentifier(),
      original: topic
    };
  }
  client.on('subscribe', function(subscription) {
    var query = generateQuery(subscription.topic);
    query.subscriptionId = subscription.subscriptionId;
    query.limit = subscription.limit;
    query.count = 0;
    query.caql = subscription.topic.streamQuery;
    client.query.push(query);
    var connectedPeers = [];

    var subscribeToPeer = function(peerName) {
      var copiedQuery = {};
      Object.keys(query).forEach(function(key) {
        copiedQuery[key] = query[key];
      });

      if(peerName) {
        copiedQuery.name = peerName;
      }

      if(connectedPeers.indexOf(copiedQuery.name) === -1) {
        connectedPeers.push(copiedQuery.name);

        if(query.name instanceof RegExp && !query.name.exec(copiedQuery.name)) {
          return;
        } 
        self._subscribe(copiedQuery);
      }

    }

    if(query.name instanceof RegExp || query.name === '*') {        
      self.zetta.pubsub.subscribe('_peer/connect', function(topic, data) {
        subscribeToPeer(data.peer.name);
      });

      Object.keys(self.peers).forEach(subscribeToPeer);
      subscribeToPeer(self.zetta._name);
    } else {
      subscribeToPeer();
    }
  });

  client.on('unsubscribe', function(subscription) {
    var query = generateQuery(subscription.topic);
    self._unsubscribe(query);
  });
};

EventBroker.prototype._publish = function(topic, sourceTopic, msg, peerName) {
  var self = this;
  var originalTopic = msg.topic || sourceTopic; // handle cases for _peer/*

  this.clients.forEach(function(client) {
    client.query.forEach(function(query) {
      
      // handle cases with the old client
      if (query.original === undefined) {
        if (query.name) {
          query.original = StreamTopic.parse(query.name + '/' + query.topic);
        } else {
          query.original = StreamTopic.parse(query.topic);
        }
      }

      var topicToMatch = (query.original.isSpecial) ? originalTopic : peerName + '/' + originalTopic;
      
      if (query.original.match(topicToMatch)) {
        if (client.streamEnabled) {
          var newMsg = {};
          newMsg.type = 'event';
          newMsg.topic = topicToMatch;
          newMsg.timestamp = msg.timestamp;
          newMsg.subscriptionId = query.subscriptionId;
          
          if (msg.data) {
            newMsg.data = msg.data;
          } else {
            // handle device and server /logs stream
            newMsg.data = {};
            var filtered = ['topic', 'timestamp'];
            Object.keys(msg)
              .filter(function(key) { return filtered.indexOf(key) === -1; })
              .forEach(function(key) {
                newMsg.data[key] = msg[key];
              })
          }
          msg = newMsg;

          query.count++;
          if (typeof query.limit === 'number' && query.count > query.limit) {
            // unsubscribe broker
            self._unsubscribe(query);
            client._unsubscribe(query.subscriptionId)
            return;
          }

          if (query.caql) {
            var compiled = client._queryCache[query.caql];
            var result = compiled.filterOne({ data: msg.data });
            if (result) {
              msg.data = result[Object.keys(result)[0]];
            } else {
              return;
            }
          }
        }

        client.send(originalTopic, msg, function(err){
          if (err) {
            console.error('ws error: '+err);
          }
        });
      }
    });
  });
};

EventBroker.prototype._subscribe = function(query) {
  var self = this;
  var topic = query.topic;

  // is local
  if (query.name === this.zetta.id || !query.name) {
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

  if (query.name === this.zetta.id || !query.name) {
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
// done
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
