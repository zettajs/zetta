var assert = require('assert');
var WebSocket = require('ws');
var zetta = require('./..');
var zettacluster = require('zetta-cluster');
var Driver = require('./fixture/example_driver');

describe('Event Streams', function() {
  var cluster = null;
  var urls = [];
  var baseUrl = '/events';
  
  beforeEach(function(done) {
    urls = [];
    cluster = zettacluster({ zetta: zetta })
      .server('cloud')
      .server('hub', [Driver], ['cloud'])
      .on('ready', function() {
        app = cluster.servers['cloud'];
        urls.push('localhost:' + cluster.servers['cloud']._testPort);
        urls.push('localhost:' + cluster.servers['hub']._testPort);
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
        var msg = { action: 'subscribe', topic: 'hub/led/1234/state' };
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

    it('unsubscribing to a topic receives a unsubscription-ack', function(idx, done) {
      var endpoint = urls[idx];
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      ws.on('open', function() {
        var msg = { action: 'subscribe', topic: 'hub/led/1234/state' };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          var msg = { action: 'unsubscribe', subscriptionId, json.subscriptionId };
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

    it('verify error message format', function(){})

    it('specific topic subscription only receives messages with that topic', function() {})

    it('wildcard topic receives all messages for all topics', function() {})

    it('topic that doesnt exist still opens stream', function(idx, done) {
      var endpoint = urls[idx];
      var ws = new WebSocket('ws://' + endpoint + baseUrl);
      ws.on('open', function() {
        var msg = { action: 'subscribe', topic: 'random_topic' };
        ws.send(JSON.stringify(msg));
        ws.on('message', function(buffer) {
          var json = JSON.parse(buffer);
          assert.equal(json.type, 'subscribe-ack');
          assert(json.timestamp);
          assert.equal(json.topic, 'random_topic');
          assert(json.subscriptionId);
          done();
        });
      });
      ws.on('error', done);
    })

    it('wildcard and specific topic will each publish a message on a subscription', function() {})

    it('topic format is {server}/{type}/{id}/{streamName}', function() {})

    it('adding limit to subscription should limit number of messages received', function(){})

    it('when limit is reached a unsubscribe-ack should be received', function(){})

  });

  describe('SPDY API', function() {
  });

});
