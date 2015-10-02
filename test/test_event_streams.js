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

    itBoth('wildcard topic receives all messages for all topics', function(idx, done) {
      var endpoint = urls[idx];
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      var subscriptionId = null;
      var count = 0;
      var topic = 'hub/led/*/state';
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
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
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
      var topicOne = 'hub/led/*/state';
      var topicTwo = 'hub/led/1234/state';
      var data = null;
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
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId);
            assert.equal(json.data, data);
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
      var topic = 'hub/led/1234/state';
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
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId, subscriptionId);
            assert.equal(json.data);
            count++;
            if(count === 10) {
              done();
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
      var topic = 'hub/led/1234/state';
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
          } else if(json.type === 'event') {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId, subscriptionId);
            assert.equal(json.data);
            count++;
          } else if(json.type === 'unsubscribe-ack') {
            assert.equal(json.type, 'unsubscribe-ack');
            assert(timestamp);
            assert.equal(json.subscriptionId, subscriptionId);
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
