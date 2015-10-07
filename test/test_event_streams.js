var assert = require('assert');
var WebSocket = require('ws');
var zetta = require('./..');
var zettacluster = require('zetta-cluster');
var Driver = require('./fixture/example_driver');

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
      .on('ready', function() {
        app = cluster.servers['cloud'];
        urls.push('localhost:' + cluster.servers['cloud']._testPort);
        urls.push('localhost:' + cluster.servers['hub']._testPort);
        
        Object.keys(cluster.servers['hub'].runtime._jsDevices).forEach(function(id) {
          var device = cluster.servers['hub'].runtime._jsDevices[id];
          devices.push(device);
          validTopics.push('hub/' + device.type + '/' + device.id + '/state');
        });

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
              for(var i=0; i<11; i++) {
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

  });

  describe('SPDY API', function() {
  });

});
