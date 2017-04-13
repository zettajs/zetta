const assert = require('assert');
const http = require('http');
const WebSocket = require('ws');
const zetta = require('../');
const zettacluster = require('zetta-cluster');
const Scout = require('./fixture/example_scout');

describe('Peer Connection Events in Pubsub', function() {
  let cluster = null;
  const device = null;
  beforeEach(function(done) {
    cluster = zettacluster({ zetta: zetta })
      .server('cloud')
      .server('detroit1', [Scout], ['cloud']);
    done();
  });

  afterEach(function(done) {
    cluster.stop();
    setTimeout(done, 10); // fix issues with server not being closed before a new one starts
  });

  describe('Initiator Events', function() {
    it('should recieve a _peer/connect event', function(done) {
      
      let recv = 0;
      cluster.servers['detroit1'].pubsub.subscribe('_peer/connect',function() {
        recv++;
      });

      cluster.on('ready', function(err) {
        assert.equal(recv, 1);
        done();
      });

      cluster.run(function(err) {
        if (err) {
          return done(err);
        }
      });

    });
  });

  describe('Acceptor Events', function() {
    it('should recieve a _peer/connect event', function(done) {
      
      let recv = 0;
      cluster.servers['cloud'].pubsub.subscribe('_peer/connect',function() {
        recv++;
      });

      cluster.on('ready', function(err) {
        assert.equal(recv, 1);
        done();
      });

      cluster.run(function(err) {
        if (err) {
          return done(err);
        }
      });

    });    
  });
});
