var assert = require('assert');
var WebSocket = require('ws');
var zetta = require('./..');
var zettacluster = require('zetta-cluster');
var Driver = require('./fixture/example_driver');
var MemRegistry = require('./fixture/mem_registry');
var MemPeerRegistry = require('./fixture/mem_peer_registry');

describe('Peering Event Streams', function() {
  var cloud = null;
  var cloudUrl = null;
  var baseUrl = '/events';
  
  beforeEach(function(done) {
    cloud = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
    cloud.silent();
    cloud.listen(0, function(err) {
      if(err) {
        return done(err);  
      } 
      cloudUrl = 'http://localhost:' + cloud.httpServer.server.address().port;
      done(); 
    });
  });
  
  afterEach(function(done) {
    cloud.httpServer.server.close();
    done();
  });
  
  it('will receive a _peer/connect event when subscribed', function(done) {
    var z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
    z.silent();
    z.listen(0, function(err) {
      if(err) {
        return done(err);  
      }  
      var zPort = z.httpServer.server.address().port;
      var endpoint = 'localhost:' + zPort;
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: '_peer/connect' };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, '_peer/connect');
            assert(json.subscriptionId);
          } else if(json.type === 'event') {
            assert.equal(json.topic, '_peer/connect');
            done();
          }
        });
      });
      ws.on('error', done);
      z.link(cloudUrl);
    });
  });

  it('will receive a _peer/connect event when subscribed to **', function(done) {
    var z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
    z.silent();
    z.listen(0, function(err) {
      if(err) {
        return done(err);  
      }
      var zPort = z.httpServer.server.address().port;
      var endpoint = 'localhost:' + zPort;
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: '**' };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, '**');
            assert(json.subscriptionId);
          } else if(json.type === 'event') {
            assert.equal(json.topic, '_peer/connect');
            done();
          }
        });
      });
      ws.on('error', done);
      z.link(cloudUrl);
    });
  });


  it('will receive a _peer/disconnect event when subscribed', function(done) {
    var z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
    z.silent();
    z.pubsub.subscribe('_peer/connect', function(topic, data) {
       var peer = data.peer; 
       peer.close();
    });
    z.listen(0, function(err) {
      if(err) {
        return done(err);  
      }  
      var zPort = z.httpServer.server.address().port;
      var endpoint = 'localhost:' + zPort;
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: '_peer/disconnect' };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, '_peer/disconnect');
            assert(json.subscriptionId);
          } else if(json.type === 'event') {
            assert.equal(json.topic, '_peer/disconnect');
            done();
          }
        });
      });
      ws.on('error', done);
      z.link(cloudUrl);
    });
  });  

  it('will receive a _peer/connect event when subscribed with wildcards', function(done) {
    var z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
    z.silent();
    z.pubsub.subscribe('_peer/connect', function(topic, data) {
       var peer = data.peer; 
    });
    z.listen(0, function(err) {
      if(err) {
        return done(err);  
      }  
      var zPort = z.httpServer.server.address().port;
      var endpoint = 'localhost:' + zPort;
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: '_peer/*' };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, '_peer/*');
            assert(json.subscriptionId);
          } else if(json.type === 'event') {
            assert.equal(json.topic, '_peer/connect');
            done();
          }
        });
      });
      ws.on('error', done);
      z.link(cloudUrl);
    });
  }); 
  it('will receive a _peer/connect and _peer/disconnect event when subscribed with wildcards', function(done) {
    var z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
    z.silent();
    z.pubsub.subscribe('_peer/connect', function(topic, data) {
       var peer = data.peer; 
       peer.close();
    });
    var recv = 0;
    z.listen(0, function(err) {
      if(err) {
        return done(err);  
      }  
      var zPort = z.httpServer.server.address().port;
      var endpoint = 'localhost:' + zPort;
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: '_peer/*' };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, '_peer/*');
            assert(json.subscriptionId);
          } else if(json.type === 'event') {
            recv++;
            if(recv == 1) {
              assert.equal(json.topic, '_peer/connect');
            } else if(recv == 2) {
              assert.equal(json.topic, '_peer/disconnect');
              done();  
            }
            
          }
        });
      });
      ws.on('error', done);
      z.link(cloudUrl);
    });
  });
});

describe('Event Streams', function() {
  var cluster = null;
  var urls = [];
  var baseUrl = '/events';
  var devices = [];
  var validTopics = [];
  
  beforeEach(function(done) {
    urls = [];
    devices = [];
    validTopics = [];
    cluster = zettacluster({ zetta: zetta })
      .server('cloud')
      .server('hub', [Driver, Driver], ['cloud'])
      .server('hub2', [Driver, Driver], ['cloud'])
      .on('ready', function() {
        app = cluster.servers['cloud'];
        urls.push('localhost:' + cluster.servers['cloud']._testPort);
        urls.push('localhost:' + cluster.servers['hub']._testPort);
        
        ['hub', 'hub2'].forEach(function(hubname) {
          Object.keys(cluster.servers[hubname].runtime._jsDevices).forEach(function(id) {
            var device = cluster.servers[hubname].runtime._jsDevices[id];
            devices.push(device);
            validTopics.push(hubname + '/' + device.type + '/' + device.id + '/state');
          });
        })
        done();
      })
      .run(function(err){
        if (err) {
          return done(err);
        }
      });
  });

  afterEach(function() {
    cluster.stop();
  });

  describe('Websocket API', function() {
    var itBoth = function(testMsg, test) {
      it('for cloud, ' + testMsg, test.bind(null, 0));
      it('for hub, ' + testMsg, test.bind(null, 1));
    };

    itBoth('subscribing to a topic receives a subscription-ack', function(idx, done) {
      var endpoint = urls[idx];
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: 'hub/led/1234/state' };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          assert.equal(json.type, 'subscribe-ack');
          assert(json.timestamp);
          assert.equal(json.topic, 'hub/led/1234/state');
          assert(json.subscriptionId);
          done();
        });
      });
      ws.on('error', done);
    });

    itBoth('unsubscribing to a topic receives a unsubscription-ack', function(idx, done) {
      var endpoint = urls[idx];
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: 'hub/led/1234/state' };
        ws.send(JSON.stringify(msg));
        ws.once('message', function(buffer) {
          var json = JSON.parse(buffer);
          var msg = { type: 'unsubscribe', subscriptionId: json.subscriptionId };
          ws.send(JSON.stringify(msg));
          ws.on('message', function(buffer) {
            var json2 = JSON.parse(buffer);  
            assert.equal(json2.type, 'unsubscribe-ack');
            assert(json2.timestamp);
            assert.equal(json2.subscriptionId, json.subscriptionId);
            done();
          });       
        });
      });
      ws.on('error', done);
    });

    itBoth('verify error message format', function(){});

    itBoth('specific topic subscription only receives messages with that topic', function(idx, done) {
      var endpoint = urls[idx];
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      var subscriptionId = null;
      var topic = validTopics[0];
      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;

            setTimeout(function() {
              devices[1].call('change');
              devices[0].call('change');
            }, 50);
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert.equal(json.subscriptionId, subscriptionId);
            assert(json.data);
            done();
          }
        });
      });
      ws.on('error', done);
    });

    itBoth('multiple clients specific topic subscription only receives messages with that topic', function(idx, done) {
      var endpoint = urls[idx];
      var topic = validTopics[0];
      
      var connected = 0;
      var recv = 0;

      var ws1 = new WebSocket('ws://' + endpoint + baseUrl);
      ws1.on('open', function() {
        var msg = { type: 'subscribe', topic: topic };
        ws1.send(JSON.stringify(msg));
        var subscriptionId = null;
        ws1.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            connected++;
            subscriptionId = json.subscriptionId;
            if (connected === 2) {
              setTimeout(function() {
                devices[1].call('change');
                devices[0].call('change');
              }, 50);
            }
          } else {
            assert.equal(json.topic, topic);
            assert.equal(json.subscriptionId, subscriptionId);
            recv++;
            if (recv === 2) {
              done();
            }
          }
        });
      });
      ws1.on('error', done);

      var ws2 = new WebSocket('ws://' + endpoint + baseUrl);
      ws2.on('open', function() {
        var msg = { type: 'subscribe', topic: topic };
        ws2.send(JSON.stringify(msg));
        var subscriptionId = null;
        ws2.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            subscriptionId = json.subscriptionId;
            connected++;
            if (connected === 2) {
              setTimeout(function() {
                devices[0].call('change');
              }, 50);
            }
          } else {
            assert.equal(json.topic, topic);
            assert.equal(json.subscriptionId, subscriptionId);
            recv++;
            if (recv === 2) {
              done();
            }
          }
        });
      });
      ws2.on('error', done);
    });

    itBoth('multiple clients using different topic subscriptions only receive one message per event', function(idx, done) {
      var endpoint = urls[idx];
      var topic = validTopics[0];
      
      var connected = 0;
      var recv1 = 0;

      var ws1 = new WebSocket('ws://' + endpoint + baseUrl);
      ws1.on('open', function() {
        var msg = { type: 'subscribe', topic: topic };
        ws1.send(JSON.stringify(msg));
        var subscriptionId = null;
        ws1.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            connected++;
            subscriptionId = json.subscriptionId;
            if (connected === 2) {
              setTimeout(function() {
                devices[0].call('change');
              }, 50);
            }
          } else {
            assert.equal(json.topic, topic);
            assert.equal(json.subscriptionId, subscriptionId);
            recv1++;
          }
        });
      });
      ws1.on('error', done);

      var recv2 = 0;
      var ws2 = new WebSocket('ws://' + endpoint + baseUrl);
      ws2.on('open', function() {
        var msg = { type: 'subscribe', topic: 'hub/testdriver/*/state' };
        ws2.send(JSON.stringify(msg));
        var subscriptionId = null;
        ws2.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            subscriptionId = json.subscriptionId;
            connected++;
            if (connected === 2) {
              setTimeout(function() {
                devices[0].call('change');
              }, 50);
            }
          } else {
            assert.equal(json.topic, topic);
            assert.equal(json.subscriptionId, subscriptionId);
            recv2++;
          }
        });
      });
      ws2.on('error', done);

      setTimeout(function() {
        assert.equal(recv1, 1);
        assert.equal(recv2, 1);
        done();
      }, 250);
    });

    itBoth('wildcard server topic subscription only receives messages with that topic', function(idx, done) {
      var endpoint = urls[idx];
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      var subscriptionId = null;
      var topic = validTopics[0];
      topic = topic.replace('hub', '*');
      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;

            setTimeout(function() {
              devices[1].call('change');
              devices[0].call('change');
            }, 50);
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert.equal(json.topic, validTopics[0]);
            assert.equal(json.subscriptionId, subscriptionId);
            assert(json.data);
            done();
          }
        });
      });
      ws.on('error', done);
    });

    itBoth('wildcard topic and static topic subscription will receive messages for both subscriptions', function(idx, done) {
      var endpoint = urls[idx];
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      var lastSubscriptionId = null;
      var count = 0;
      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: validTopics[0] };
        ws.send(JSON.stringify(msg));
        msg = { type: 'subscribe', topic: 'hub/testdriver/*/state' };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert(json.subscriptionId);
            setTimeout(function() {
              devices[0].call('change');
            }, 50);
          } else {
            count++;
            assert.notEqual(lastSubscriptionId, json.subscriptionId);
            lastSubscriptionId = json.subscriptionId;
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert.equal(json.topic, validTopics[0]);
            assert(json.data);
            if (count === 2) {
              done();
            }
          }
        });
      });
      ws.on('error', done);
    });

    itBoth('wildcard device id topic subscription and cloud app query both will recieve data', function(idx, done) {
      var endpoint = urls[idx];
      var subscriptionId = null;
      var topic = 'hub/testdriver/*/state';

      var runtime = cluster.servers['cloud'].runtime;
      var query = runtime.from('hub').where({ type: 'testdriver', id: devices[0].id });
      runtime.observe(query, function(device) {
        var ws = new WebSocket('ws://' + endpoint + baseUrl);
        ws.on('open', function() {
          var msg = { type: 'subscribe', topic: topic };
          ws.send(JSON.stringify(msg));
          ws.on('message', function(buffer) {
            var json = JSON.parse(buffer);
            if(json.type === 'subscribe-ack') {
              assert.equal(json.type, 'subscribe-ack');
              assert(json.timestamp);
              assert.equal(json.topic, topic);
              assert(json.subscriptionId);
              subscriptionId = json.subscriptionId;

              setTimeout(function() {
                devices[0].call('change');
              }, 50);
            } else {
              assert.equal(json.type, 'event');
              assert(json.timestamp);
              assert.equal(json.topic, validTopics[0]);
              assert.equal(json.subscriptionId, subscriptionId);
              assert(json.data);
              done();
            }
          });
        });
        ws.on('error', done);
      });
    });

    itBoth('wildcard device id topic subscription and hub app query both will recieve data', function(idx, done) {
      var endpoint = urls[idx];
      var subscriptionId = null;
      var topic = 'hub/testdriver/*/state';

      var runtime = cluster.servers['hub'].runtime;
      var query = runtime.where({ type: 'testdriver', id: devices[0].id });
      runtime.observe(query, function(device) {
        var ws = new WebSocket('ws://' + endpoint + baseUrl);
        ws.on('open', function() {
          var msg = { type: 'subscribe', topic: topic };
          ws.send(JSON.stringify(msg));
          ws.on('message', function(buffer) {
            var json = JSON.parse(buffer);
            if(json.type === 'subscribe-ack') {
              assert.equal(json.type, 'subscribe-ack');
              assert(json.timestamp);
              assert.equal(json.topic, topic);
              assert(json.subscriptionId);
              subscriptionId = json.subscriptionId;

              setTimeout(function() {
                devices[0].call('change');
              }, 50);
            } else {
              assert.equal(json.type, 'event');
              assert(json.timestamp);
              assert.equal(json.topic, validTopics[0]);
              assert.equal(json.subscriptionId, subscriptionId);
              assert(json.data);
              done();
            }
          });
        });
        ws.on('error', done);
      });
    });

    it('wildcard server topic subscription receives messages from both hubs', function(done) {
      var endpoint = urls[0];
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      var subscriptionId = null;
      var topic = '*/testdriver/*/state';
      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: topic };
        ws.send(JSON.stringify(msg));
        var recv = 0;
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;

            setTimeout(function() {
              devices[0].call('change');
              devices[2].call('change');
            }, 50);
          } else {
            recv++;
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert.equal(json.subscriptionId, subscriptionId);
            assert(json.data);
            if (recv === 2) {
              done();
            }
          }
        });
      });
      ws.on('error', done);
    });
    
    it('wildcard topic ** will subscribe to all topics for both hubs', function(done) {
      var endpoint = urls[0]; // cloud
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      var subscriptionId = null;
      var topic = '**';

      var neededTopics = [];
      devices.forEach(function(device, idx) {
        var server = (idx < 2) ? 'hub' : 'hub2';
        neededTopics.push(server + '/' + device.type + '/' + device.id + '/' + 'state');
        neededTopics.push(server + '/' + device.type + '/' + device.id + '/' + 'logs');
      });

      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;

            setTimeout(function() {
              devices[0].call('change');
              devices[1].call('change');
              devices[2].call('change');
              devices[3].call('change');
            }, 250);
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert.equal(json.subscriptionId, subscriptionId);
            assert(json.data);
            var idx = neededTopics.indexOf(json.topic);
            assert.notEqual(idx, -1);
            neededTopics.splice(idx, 1);
            if (neededTopics.length === 0) {
              done();
            }
          }
        });
      });
      ws.on('error', done);
    });

    it('wildcard topic ** will subscribe to all topics for single hub', function(done) {
      var endpoint = urls[1]; // hub
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      var subscriptionId = null;
      var topic = '**';

      var neededTopics = [];
      for (var i=0; i<2; i++) {
        var device = devices[i];
        neededTopics.push('hub/' + device.type + '/' + device.id + '/' + 'state');
        neededTopics.push('hub/' + device.type + '/' + device.id + '/' + 'logs');
      }

      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;

            setTimeout(function() {
              devices[0].call('change');
              devices[1].call('change');
              devices[2].call('change');
              devices[3].call('change');
            }, 50);
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert.equal(json.subscriptionId, subscriptionId);
            assert(json.data);
            var idx = neededTopics.indexOf(json.topic);
            assert.notEqual(idx, -1);
            neededTopics.splice(idx, 1);
            if (neededTopics.length === 0) {
              done();
            }
          }
        });
      });
      ws.on('error', done);
    });

    itBoth('wildcard topic for single peer receives all messages for all topics', function(idx, done) {
      var endpoint = urls[idx];
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      var subscriptionId = null;
      var count = 0;
      var topic = 'hub/testdriver/*/state';
      var lastTopic = null;
      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;

            setTimeout(function() {
              devices[0].call('change');
              devices[1].call('change');
            }, 50);
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert.notEqual(json.topic, lastTopic);
            lastTopic = json.topic;
            assert.equal(json.subscriptionId, subscriptionId);
            assert(json.data);
            count++;
            if(count === 2) {
              done();
            }
          }
        });
      });
      ws.on('error', done);  
    });
    
    itBoth('wildcard topic for device id and stream types receives all messages for all topics', function(idx, done) {
      var endpoint = urls[idx];
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      var subscriptionId = null;
      var count = 0;
      var topic = 'hub/testdriver/**';
      var lastTopic = null;
      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;

            setTimeout(function() {
              devices[0].call('change');
              devices[1].call('change');
            }, 50);
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert.notEqual(json.topic, lastTopic);
            lastTopic = json.topic;
            assert.equal(json.subscriptionId, subscriptionId);
            assert(json.data);
            count++;
            if(count === 4) {
              done();
            }
          }
        });
      });
      ws.on('error', done);  
    });

    itBoth('subscribing to logs topic on device will get properly formated response', function(idx, done) {
      var endpoint = urls[idx];
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      var subscriptionId = null;
      var topic = 'hub/testdriver/*/logs';
      var lastTopic = null;
      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;
            setTimeout(function() {
              devices[0].call('change');
            }, 50);
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert.notEqual(json.topic, lastTopic);
            lastTopic = json.topic;
            assert.equal(json.subscriptionId, subscriptionId);
            assert(json.data);
            assert.equal(json.data.transition, 'change');
            assert(!json.data.transitions);
            assert.deepEqual(json.data.input, []);
            assert(json.data.properties);
            assert(json.data.actions);
            done();
          }
        });
      });
      ws.on('error', done);  
    });


    itBoth('topic that doesnt exist still opens stream', function(idx, done) {
      var endpoint = urls[idx];
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      var topic = 'blah/foo/1/blah';
      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          assert.equal(json.type, 'subscribe-ack');
          assert(json.timestamp);
          assert.equal(json.topic, topic);
          assert(json.subscriptionId);
          done();
        });
      });
      ws.on('error', done);
    });

    it('subscription cloud will get _peer/connect events from hub', function(done) {
      var endpoint = urls[0];
      var topic = 'hub/**';
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      ws.on('open', function() {
        ws.send(JSON.stringify({ type: 'subscribe', topic: topic }));
        
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if (json.type === 'subscribe-ack') {
            var z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
            z.name('some-peer');
            z.link('http://' + urls[1]); // link to hub
            z.silent();
            z.listen(0);
          } else if (json.type === 'event'){
            assert.equal(json.topic, 'hub/_peer/connect');
            assert.equal(json.data.id, 'some-peer');
            done();
          }
        });

      });
    });

    itBoth('subscription to non existent hub does not return data for that subscriptionId', function(idx, done) {
      var endpoint = urls[idx];
      var ws = new WebSocket('ws://' + endpoint + baseUrl);   
      var validTopic = validTopics[0];
      var invalidTopic = validTopic.replace('hub/', 'notahub/');
      var invalidSubscriptionId = null;

      ws.on('open', function() {
        ws.send(JSON.stringify({ type: 'subscribe', topic: invalidTopic }));
        ws.send(JSON.stringify({ type: 'subscribe', topic: validTopic }));

        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if (json.type === 'subscribe-ack') {
            if (json.topic === invalidTopic) {
              invalidSubscriptionId = json.subscriptionId;
            }
            setTimeout(function() {
              devices[0].call('change');
            }, 50)
          } else {
            assert.notEqual(json.subscriptionId, invalidSubscriptionId);
            done();
          }
        });
      });
      ws.on('error', done);
    });

    itBoth('wildcard and specific topic will each publish a message on a subscription', function(idx, done) {
      var endpoint = urls[idx];
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      var subscriptionId = null;
      var count = 0;
      var ackCount = 0;
      var topicOne = validTopics[0];
      var topicTwo = 'hub/testdriver/*/state';
      ws.on('open', function() {
        var msgOne = { type: 'subscribe', topic: topicOne };
        var msgTwo = { type: 'subscribe', topic: topicTwo };
        ws.send(JSON.stringify(msgOne));
        ws.send(JSON.stringify(msgTwo));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;
            ackCount++;
            setTimeout(function() {
              for(var i=0; i<11; i++) {
                devices[0].call((i % 2 === 0) ? 'change' : 'prepare');
              }
            }, 50);
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId);
            count++;
            if(count === 2) {
              assert.equal(ackCount, 2);
              done();
            }
          }
        });
      });
      ws.on('error', done);     
    });

    itBoth('adding limit to subscription should limit number of messages received', function(idx, done){
      var endpoint = urls[idx];
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      var subscriptionId = null;
      var count = 0;
      var topic = validTopics[0];
      var data = null;
      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: topic, limit: 10 };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;

            setTimeout(function() {
              for(var i=0; i<15; i++) {
                devices[0].call((i % 2 === 0) ? 'change' : 'prepare');
              }
            }, 50);
          } else if (json.type !== 'unsubscribe-ack') {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId, subscriptionId);
            assert(json.data);

            count++;
            if(count === 10) {
              setTimeout(function() {
                assert.equal(count, 10);
                done();
              }, 200)
            }
          }
        });
      });
      ws.on('error', done);  
    });

    itBoth('when limit is reached a unsubscribe-ack should be received', function(idx, done){
      var endpoint = urls[idx];
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      var subscriptionId = null;
      var count = 0;
      var topic = validTopics[0];
      var data = null;
      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: topic, limit: 10 };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;
            setTimeout(function() {
              for(var i=0; i<11; i++) {
                devices[0].call((i % 2 === 0) ? 'change' : 'prepare');
              }
            }, 50);
          } else if(json.type === 'event') {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId, subscriptionId);
            assert(json.data);
            count++;
          } else if(json.type === 'unsubscribe-ack') {
            assert.equal(json.type, 'unsubscribe-ack');
            assert(json.timestamp);
            assert.equal(json.subscriptionId, subscriptionId);
            assert.equal(count, 10);
            done();
          }
        });
      });
      ws.on('error', done);  
    });

    itBoth('when limit is reached with a query selector a unsubscribe-ack should be received', function(idx, done){
      var endpoint = urls[idx];
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      var subscriptionId = null;
      var count = 0;
      var topic = 'hub/testdriver/' + devices[0].id + '/bar?select data where data >= 5';
      var data = null;
      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: topic, limit: 10 };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;
            setTimeout(function() {
              for(var i=0; i<16; i++) {
                devices[0].incrementStreamValue();
              }
            }, 50);
          } else if(json.type === 'event') {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId, subscriptionId);
            assert(json.data);
            count++;
          } else if(json.type === 'unsubscribe-ack') {
            assert.equal(json.type, 'unsubscribe-ack');
            assert(json.timestamp);
            assert.equal(json.subscriptionId, subscriptionId);
            assert.equal(count, 10);
            done();
          }
        });
      });
      ws.on('error', done);  
    });

    itBoth('query field selector should only return properties in selection', function(idx, done){
      var endpoint = urls[idx];
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      var subscriptionId = null;
      var count = 0;
      var topic = 'hub/testdriver/' + devices[0].id + '/bar?select data where data >= 1';
      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;
            setTimeout(function() {
              devices[0].incrementStreamValue();
            }, 50);
          } else if(json.type === 'event') {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId, subscriptionId);
            assert(json.data);
            done();
          }
        });
      });
      ws.on('error', done);  
    });

    itBoth('query field selector * should all properties in selection', function(idx, done){
      var endpoint = urls[idx];
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      var subscriptionId = null;
      var count = 0;
      var topic = 'hub/testdriver/' + devices[0].id + '/fooobject?select * where data.val >= 2';
      var data = { foo: 'bar', val: 2 };
      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;
            setTimeout(function() {
              devices[0].publishStreamObject(data);
            }, 50);
          } else if(json.type === 'event') {
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId, subscriptionId);
            assert(json.data);
            assert.equal(json.data.val, 2);
            assert.equal(json.data.foo, 'bar');
            done();
          }
        });
      });
      ws.on('error', done);  
    });

    itBoth('query field selector should return only selected properties', function(idx, done){
      var endpoint = urls[idx];
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      var subscriptionId = null;
      var count = 0;
      var topic = 'hub/testdriver/' + devices[0].id + '/fooobject?select data.val';
      var data = { foo: 'bar', val: 2 };
      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;
            setTimeout(function() {
              devices[0].publishStreamObject(data);
            }, 50);
          } else if(json.type === 'event') {
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId, subscriptionId);
            assert(json.data);
            assert.equal(json.data.val, 2);
            assert.equal(json.data.foo, undefined);
            done();
          }
        });
      });
      ws.on('error', done);  
    });

    itBoth('subscribing to all ** and then unsubscribing followed by a peer connecting wont crash zetta', function(idx, done){
      var endpoint = urls[idx];
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      var topic = '**';
      ws.on('open', function() {
        var msg = { type: 'subscribe', topic: topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId);
            var msg = { type: 'unsubscribe', subscriptionId: json.subscriptionId };
            ws.send(JSON.stringify(msg));
          } else if(json.type === 'unsubscribe-ack') {
            var z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
            z.silent();
            z.name('some-new-peer')
            z.link('http://' + urls[0]);
            z.use(function(server) {
              server.pubsub.subscribe('_peer/connect', function(topic, data) {
                setTimeout(function() {
                  done();
                }, 400);
              });
            });
            z.listen(0);
          }
        });
      });
      ws.on('error', done);  
    });

    describe('Protocol Errors', function() {

      var makeTopicStringErrorsTest = function(topic) {
        itBoth('invalid stream topic "' + topic + '" should result in a 400 error', function(idx, done){
          var endpoint = urls[idx];
          var ws = new WebSocket('ws://' + endpoint + baseUrl);
          ws.on('open', function() {
            var msg = { type: 'subscribe', topic: topic };
            ws.send(JSON.stringify(msg));
            ws.on('message', function(buffer) {
              var json = JSON.parse(buffer);
              assert(json.timestamp);
              assert.equal(json.topic, topic);
              assert.equal(json.code, 400);
              assert(json.message);
              done();
            });
          });
          ws.on('error', done);  
        });
      };

      makeTopicStringErrorsTest('*');
      makeTopicStringErrorsTest('hub');
      makeTopicStringErrorsTest('{hub.+}');
      makeTopicStringErrorsTest('*/');
      makeTopicStringErrorsTest('**/');
      makeTopicStringErrorsTest('hub/');
      makeTopicStringErrorsTest('{hub.+}/');

      itBoth('invalid stream query should result in a 400 error', function(idx, done){
        var endpoint = urls[idx];
        var ws = new WebSocket('ws://' + endpoint + baseUrl);
        var subscriptionId = null;
        var count = 0;
        var topic = 'hub/testdriver/' + devices[0].id + '/fooobject?invalid stream query';
        var data = { foo: 'bar', val: 2 };
        ws.on('open', function() {
          var msg = { type: 'subscribe', topic: topic };
          ws.send(JSON.stringify(msg));
          ws.on('message', function(buffer) {
            var json = JSON.parse(buffer);
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert.equal(json.code, 400);
            assert(json.message);
            done();
          });
        });
        ws.on('error', done);  
      });

      itBoth('invalid subscribe should result in a 400 error', function(idx, done){
        var endpoint = urls[idx];
        var ws = new WebSocket('ws://' + endpoint + baseUrl);
        var subscriptionId = null;
        var count = 0;
        var topic = 'hub/testdriver/' + devices[0].id + '/fooobject';
        ws.on('open', function() {
          var msg = { type: 'subscribe' };
          ws.send(JSON.stringify(msg));
          ws.on('message', function(buffer) {
            var json = JSON.parse(buffer);
            assert(json.timestamp);
            assert.equal(json.code, 400);
            assert(json.message);
            done();
          });
        });
        ws.on('error', done);  
      });

      itBoth('unsubscribing from an invalid subscriptionId should result in a 400 error', function(idx, done){
        var endpoint = urls[idx];
        var ws = new WebSocket('ws://' + endpoint + baseUrl);
        var subscriptionId = null;
        var count = 0;
        ws.on('open', function() {
          var msg = { type: 'unsubscribe', subscriptionId: 123 };
          ws.send(JSON.stringify(msg));
          ws.on('message', function(buffer) {
            var json = JSON.parse(buffer);
            assert(json.timestamp);
            assert.equal(json.code, 405);
            assert(json.message);
            done();
          });
        });
        ws.on('error', done);  
      });

      itBoth('unsubscribing from a missing subscriptionId should result in a 400 error', function(idx, done){
        var endpoint = urls[idx];
        var ws = new WebSocket('ws://' + endpoint + baseUrl);
        var subscriptionId = null;
        var count = 0;
        ws.on('open', function() {
          var msg = { type: 'unsubscribe' };
          ws.send(JSON.stringify(msg));
          ws.on('message', function(buffer) {
            var json = JSON.parse(buffer);
            assert(json.timestamp);
            assert.equal(json.code, 400);
            assert(json.message);
            done();
          });
        });
        ws.on('error', done);  
      });

      itBoth('on invalid message should result in a 400 error', function(idx, done){
        var endpoint = urls[idx];
        var ws = new WebSocket('ws://' + endpoint + baseUrl);
        var subscriptionId = null;
        var count = 0;
        ws.on('open', function() {
          var msg = { test: 123 };
          ws.send(JSON.stringify(msg));
          ws.on('message', function(buffer) {
            var json = JSON.parse(buffer);
            assert(json.timestamp);
            assert.equal(json.code, 400);
            assert(json.message);
            done();
          });
        });
        ws.on('error', done);  
      });


    })

  });

  describe('SPDY API', function() {
  });

});
