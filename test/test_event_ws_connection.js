var assert = require('assert');
var http = require('http');
var WebSocket = require('ws');
var request = require('supertest');
var util = require('util');
var Scout = require('../zetta_runtime').Scout;
var zetta = require('../zetta');
var mocks = require('./fixture/scout_test_mocks');
var MockRegistry = mocks.MockRegistry;
var GoodDevice = require('./fixture/example_driver');
var PeerRegistry = require('./fixture/scout_test_mocks').MockPeerRegistry;

var GoodScout = module.exports = function() {
  this.count = 0;
  this.interval = 5000;
  Scout.call(this);
};
util.inherits(GoodScout, Scout);

GoodScout.prototype.init = function(cb){
  var query = this.server.where({type:'test', vendorId:'1234567'});
  var self = this;
  this.server.find(query, function(err, results){
    if(!err) {
      if(results.length) {
        self.provision(results[0], GoodDevice);   
      }
    }
  });
  cb();
};

var TEST_PORT = process.env.TEST_PORT || Math.floor(3000 + Math.random() * 1000);

describe('Event Websocket', function() {
  var peerRegistry = null;
  var registry = null;
  var app = null;
  var deviceUrl = 'localhost:' + TEST_PORT + '/servers/BC2832FD-9437-4473-A4A8-AC1D56B12C61/devices/BC2832FD-9437-4473-A4A8-AC1D56B12C6F';

  beforeEach(function(done) {
    peerRegistry = new PeerRegistry();
    registry = new MockRegistry();
    registry.machines.push({id:'BC2832FD-9437-4473-A4A8-AC1D56B12C6F',type:'test', vendorId:'1234567', foo:'foo', bar:'bar', name:'Test Device'});
    app = zetta({registry: registry, peerRegistry: peerRegistry});
    app.id = 'BC2832FD-9437-4473-A4A8-AC1D56B12C61';
    app.use(GoodScout)
    app.listen(TEST_PORT, function(err){
      done(err);
    });
  });
  
  afterEach(function(done) {
    app.httpServer.server.close();
    done();
  });


  it('http resource should exist with statusCode 200', function(done) {
    http.get('http://'+deviceUrl, function(res) {
      assert.equal(res.statusCode, 200);
      done();
    }).on('error', done);
  });

  it('websocket should connect', function(done) {
    var url = 'ws://' + deviceUrl + '/bar';
    var error = 0;
    var open = false;
    var socket = new WebSocket(url);
    socket.on('open', function(err) {
      open = true;
    });
    socket.on('error', function(err) {
      error++;
    });

    setTimeout(function() {
      socket.close();
      assert.equal(error, 0);
      assert.equal(open, true);
      done();
    }, 20);    
  });
});


