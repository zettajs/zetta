var JSCompiler = require('caql-js-compiler');
var querytopic = require('./query_topic');
var StreamTopic = require('zetta-events-stream-protocol').StreamTopic;

var EventBroker = module.exports = function(zetta) {
  this.zetta = zetta;

  this.peers = {};
  this.clients = [];

  // List of subscriptions for a peer that has not yet been connected
  this._peerSubscriptions = {}; // { <serverName>: [] }

  // Hash of all current subscribed device queries and their observables.
  this._deviceQueries = {}; // { <queryString>: Observable }

  this._queryCache = {};
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
  
  // query: { name: <serverName>, topic: <pubsub topic>}
  client.query.forEach(function(query) {
    self._subscribe(client, query, self._publishNonStreamEnabledClient.bind(self));
  });
};

EventBroker.prototype._subscribe = function(client, query, sendMethod) {
  var self = this;
  var subscriptionTopic = query.topic; 
  var isRemote = false;
  if (query.name && query.name !== self.zetta.id) {
    isRemote = true;
    // subscribe through peer socket
    self._subscribeToPeer(query.name, query.topic);
    // Change subsciptions topic to append <serverName>/<topic> when it comes accross pubsub
    subscriptionTopic = query.name + '/' + query.topic;
  } else {
    // If topic is device query setup an obserable
    if (querytopic.isQuery(subscriptionTopic)) {
      self.subscribeToDeviceQuery(subscriptionTopic);
    }
  }

  var handler = function(topic, data, sourceTopic, fromRemote) {
    sendMethod(client, query, topic, data, sourceTopic, fromRemote);
  };
  self.zetta.pubsub.subscribe(subscriptionTopic, handler);

  var unsubscribe = function() {
    self.zetta.pubsub.unsubscribe(subscriptionTopic, handler);

    // If topic is a device query disposeof it.
    if (self._deviceQueries[subscriptionTopic]) {
      self._deviceQueries[subscriptionTopic].dispose();
      delete self._deviceQueries[subscriptionTopic];
    }

    if (isRemote) {
      // Use original query.topic to unsubscribe from peer
      self._unsubscribeFromPeer(query.name, query.topic);
    }
  };

  client.once('close', function() {
    unsubscribe();
  });
  
  return unsubscribe;
};

EventBroker.prototype._publishNonStreamEnabledClient = function(client, query, topic, data, sourceTopic, fromRemote) {
  client.send(query.topic, data, function(err){
    if (err) {
      console.error('ws error: '+err);
    }
  });
};

EventBroker.prototype._publishStreamEnabledClient = function(client, query, topic, data, sourceTopic, fromRemote) {
  var newMsg = {};
  newMsg.type = 'event';
  newMsg.topic = sourceTopic;
  newMsg.timestamp = data.timestamp;
  newMsg.subscriptionId = query.subscriptionId;
  
  if (data.data) {
    newMsg.data = data.data;
  } else {
    // handle device and server /logs stream
    newMsg.data = {};
    var filtered = ['topic', 'timestamp'];
    Object.keys(data)
      .filter(function(key) { return filtered.indexOf(key) === -1; })
      .forEach(function(key) {
        newMsg.data[key] = data[key];
      })
  }
  data = newMsg;

  query.count++;
  if (typeof query.limit === 'number' && query.count > query.limit) {
    client.emit('unsubscribe', query);
    client._unsubscribe(query.subscriptionId)
    return;
  }

  if (query.caql) {
    var compiled = client._queryCache[query.caql];
    var result = compiled.filterOne({ data: data.data });
    if (result) {
      data.data = result[Object.keys(result)[0]];
    } else {
      return;
    }
  }

  client.send(sourceTopic, data, function(err){
    if (err) {
      console.error('ws error: '+err);
    }
  });
};

EventBroker.prototype._streamEnabledClient = function(client) {
  var self = this;

  // Keep a list of unsubscribe functions to unsubscribe from pubsub
  var unsubscriptions = {}; // { <subscriptionId>: [unsubscribe1, unsubscribe2, ...] }

  client.on('subscribe', function(subscription) {

    // Sendcache per subscription
    var sendCache = [];
    var sendCacheSize = 100;

    unsubscriptions[subscription.subscriptionId] = [];

    var query = {
      name: subscription.topic.serverName(),
      topic: subscription.topic.pubsubIdentifier(),
      original: subscription.topic,
      subscriptionId: subscription.subscriptionId,
      limit: subscription.limit,
      count: 0,
      caql: subscription.topic.streamQuery
    };
    client.query.push(query);

    var connectedPeers = [];
    var subscribeToPeer = function(peerName) {
      if(query.name instanceof RegExp && !query.name.exec(peerName)) {
        return;
      }

      var copiedQuery = {};
      Object.keys(query).forEach(function(key) {
        copiedQuery[key] = query[key];
      });

      if(peerName) {
        copiedQuery.name = peerName;
      }

      if(connectedPeers.indexOf(copiedQuery.name) === -1) {
        connectedPeers.push(copiedQuery.name);
        
        var unsubscribe = self._subscribe(client, copiedQuery, function(client, query, topic, data, sourceTopic, fromRemote) {
          // Not a sepcial and topic like _peer/connect and the query is local.
          if (!query.original.isSpecial && !fromRemote) {
            // Add local serverName to topic for local pubsub because it's not on the actual topic
            sourceTopic = self.zetta.id + '/' + sourceTopic;
          }


          // B/c everything goes through the local pubsub queies that have * for the serverName
          // may match twice. one for the local query and one for each peer query
          if (sendCache.indexOf(data) >= 0) {
            return;
          } else {
            sendCache.push(data);
            if (sendCache.length > sendCacheSize) {
              sendCache.shift();
            }
          }

          self._publishStreamEnabledClient(client, query, topic, data, sourceTopic);
        });
        unsubscriptions[subscription.subscriptionId].push(unsubscribe);
      }
    };

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
    if (unsubscriptions[subscription.subscriptionId]) {
      // Unsubscribe to all subscriptions
      unsubscriptions[subscription.subscriptionId].forEach(function(unsubscribe) {
        unsubscribe();
      });
      delete unsubscriptions[subscription.subscriptionId];
    }
  });

  // Unsubscribe to all subscriptions if the client disconnects
  client.on('close', function() {
    Object.keys(unsubscriptions).forEach(function(subscriptionId) {
      unsubscriptions[subscriptionId].forEach(function(unsubscribe) {
        unsubscribe();
      });
      delete unsubscriptions[subscriptionId];
    })
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

EventBroker.prototype.subscribeToDeviceQuery = function(topic) {
  if (this._deviceQueries[topic]) {
    return;
  }

  var qt = querytopic.parse(topic);
  var self = this;
  var q = self.zetta.runtime.query().ql(qt.ql);
  this._deviceQueries[topic] = this.zetta.runtime.observe(q, function(device) {
    setImmediate(function() {
      self.zetta.pubsub.publish(topic, { query: topic, device: device });
    });
  });
};
