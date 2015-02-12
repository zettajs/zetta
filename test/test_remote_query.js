var assert = require('assert');
var http = require('http');
var zetta = require('../');
var zettacluster = require('zetta-cluster');
var Scout = require('./fixture/example_scout');
var ExampleDevice = require('./fixture/example_driver');
var VirtualDevice = require('../lib/virtual_device');
var LedJSON = require('./fixture/virtual_device.json');
var decompiler = require('calypso-query-decompiler');
var ZScout = require('zetta-scout');
var util = require('util');
var WebSocket = require('ws');


function FakeScout() {
  ZScout.call(this);
};
util.inherits(FakeScout, ZScout);

FakeScout.prototype.init = function(cb) {cb();};


var mockSocket = {
  on: function(){},
  subscribe: function(topic, cb){
    if(cb) {
      cb();
    }
  },
  unsubscribe: function(){}
};

describe('Remote queries', function() {
  var cluster = null;
  var detroit1 = null;
  var cloud = null;
  var urlLocal = null;
  var urlProxied = null

  beforeEach(function(done) {
    cluster = zettacluster({ zetta: zetta })
      .server('cloud')
      .server('detroit1', [Scout], ['cloud'])
      .on('ready', function() {
        urlProxied = 'localhost:' + cluster.servers['cloud']._testPort + '/servers/detroit1';
        urlLocal = 'localhost:' + cluster.servers['detroit1']._testPort + '/servers/detroit1';

        detroit1 = cluster.servers['detroit1'];
        cloud = cluster.servers['cloud'];
        done();
      })
      .run(function(err){
        if (err) {
          return done(err);
        }
      });
  });

  afterEach(function(done) {
    cluster.stop();
    setTimeout(done, 10); // fix issues with server not being closed before a new one starts
  });
  
  describe('remote query events', function() {

    it('should fire a remote query event on detroit1 after peers connect', function(done) {
      var query = cloud.runtime.from('detroit1').where({type: 'testdriver'});
      cloud.runtime.observe([query], function(testdriver){
      });
      var key = Object.keys(cloud.runtime._remoteSubscriptions['detroit1'])[0];
      detroit1.pubsub.subscribe(key, function() {
        done();
      });
    });

    it('should pass a remote query to peer socket through subscribe', function(done) {
      var query = cloud.runtime.from('detroit2').where({type: 'testdriver'});
      var ql = decompiler(query);
      var remove = 'select * ';
      if(ql.slice(0, remove.length) === remove) {
        ql = ql.slice(remove.length);
      }

      cloud.runtime.observe([query], function(testdriver){
      });

      var sock = {
        subscribe: function(){},
        on: function(ev, data){
          if(ev.indexOf('query:') === 0) {
            done();
          }
        },
        name: 'detroit2'
      };

      cloud.pubsub.publish('_peer/connect', { peer: sock });
    });

    it('adding a device on the remote server should add a device to app', function(done) {
      var query = cloud.runtime.from('detroit1').where({type: 'testdriver'});
      var recv = 0;
      cloud.runtime.observe([query], function(testdriver){
        recv++;
      });

      var detroit = cluster.servers['detroit1'];
      var scout = new FakeScout();
      scout.server = detroit.runtime;
      scout.discover(ExampleDevice);

      setTimeout(function() {
        assert.equal(recv, 2);
        done();
      }, 100);
    });

  });

  describe('Peer Reconnects', function() {

    it('runtime should only pass the device once to app', function(done) {
      var query = cloud.runtime.from('detroit1').where({type: 'testdriver'});
      var recv = 0;
      cloud.runtime.observe([query], function(testdriver){
        recv++;
      });
      
      var socket = cluster.servers['cloud'].httpServer.peers['detroit1'];
      setTimeout(function(){
        socket.close();
      }, 100);

      cloud.pubsub.subscribe('_peer/connect', function(ev, data) {
        if (data.peer.name === 'detroit1') {
          assert.equal(recv, 1);
          done();
        }
      });
    });



    it('should send back 1 result for peer after a reconnet', function(done) {
      var socket = new WebSocket("ws://" + urlProxied + '/events?topic=query/where type = "testdriver"');
      var recv = 0;

      var socketP = cluster.servers['cloud'].httpServer.peers['detroit1'];
      setTimeout(function(){
        socketP.close();
        cloud.pubsub.subscribe('_peer/connect', function(ev, data) {
          if (data.peer.name === 'detroit1') {
            setTimeout(function() {
              assert.equal(recv, 1);
              done();
            }, 100);
          }
        });
      }, 100);

      socket.on('message', function(data) {
        var json = JSON.parse(data);
        // test links are properly set
        json.links.forEach(function(link) {
          assert(link.href.indexOf(urlProxied) > -1)
        });
        assert.equal(json.properties.type, 'testdriver');  
        recv++;
      });

      
    });
  });


  describe('Websocket Local Queries', function() {

    it('should send back 1 result for local device', function(done) {
      var socket = new WebSocket("ws://" + urlLocal + '/events?topic=query/where type = "testdriver"');
      socket.on('open', function(err) {
        socket.on('message', function(data) {
          var json = JSON.parse(data);

          // test links are properly set
          json.links.forEach(function(link) {
            assert(link.href.indexOf(urlLocal) > -1)
          });

          assert.equal(json.properties.type, 'testdriver');
          done();
        });
      });
    });

    it('should send back 2 results for local device after a device is added', function(done) {
      var socket = new WebSocket("ws://" + urlLocal + '/events?topic=query/where type = "testdriver"');
      socket.on('open', function(err) {
        var recv = 0;

        setTimeout(function(){
          var detroit = cluster.servers['detroit1'];
          var scout = new FakeScout();
          scout.server = detroit.runtime;
          scout.discover(ExampleDevice);
        }, 50);

        socket.on('message', function(data) {
          var json = JSON.parse(data);
          assert.equal(json.properties.type, 'testdriver');
          recv++;

          if (recv === 2) {
            done();
          }
        });
      });

    });

    it('reconnecting should only have 1 result', function(done) {
      var socket = new WebSocket("ws://" + urlLocal + '/events?topic=query/where type = "testdriver"');
      socket.on('open', function(err) {
        socket.on('message', function(data) {
          var json = JSON.parse(data);
          assert.equal(json.properties.type, 'testdriver');
          socket.close();

          var socket2 = new WebSocket("ws://" + urlLocal + '/events?topic=query/where type = "testdriver"');
          socket2.on('open', function(err) {
            socket2.on('message', function(data) {
              var json = JSON.parse(data);
              assert.equal(json.properties.type, 'testdriver');
              done();
            });
          });
          
        });
      });
    });

  });





  describe('Websocket Proxied Queries', function() {

    it('should send back 1 result for local device', function(done) {
      var socket = new WebSocket("ws://" + urlProxied + '/events?topic=query/where type = "testdriver"');
      socket.on('open', function(err) {
        socket.on('message', function(data) {
          var json = JSON.parse(data);

          // test links are properly set
          json.links.forEach(function(link) {
            assert(link.href.indexOf(urlProxied) > -1)
          });
          
          assert.equal(json.properties.type, 'testdriver');
          done();
        });
      });
    });

    it('should send back 2 results for local device after a device is added', function(done) {
      var socket = new WebSocket("ws://" + urlProxied + '/events?topic=query/where type = "testdriver"');
      socket.on('open', function(err) {
        var recv = 0;

        setTimeout(function(){
          var detroit = cluster.servers['detroit1'];
          var scout = new FakeScout();
          scout.server = detroit.runtime;
          scout.discover(ExampleDevice);
        }, 50);

        socket.on('message', function(data) {
          var json = JSON.parse(data);
          assert.equal(json.properties.type, 'testdriver');
          recv++;

          if (recv === 2) {
            done();
          }
        });
      });

    });

    it('reconnecting should only have 1 result', function(done) {
      var socket = new WebSocket("ws://" + urlProxied + '/events?topic=query/where type = "testdriver"');
      socket.on('open', function(err) {
        socket.on('message', function(data) {
          var json = JSON.parse(data);
          assert.equal(json.properties.type, 'testdriver');
          socket.close();

          var socket2 = new WebSocket("ws://" + urlProxied + '/events?topic=query/where type = "testdriver"');
          socket2.on('open', function(err) {
            socket2.on('message', function(data) {
              var json = JSON.parse(data);
              assert.equal(json.properties.type, 'testdriver');
              done();
            });
          });
          
        });
      });
    });

  });


});

