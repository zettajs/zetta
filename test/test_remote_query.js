var assert = require('assert');
var http = require('http');
var zettatest = require('./fixture/zetta_test');
var Scout = require('./fixture/example_scout');
var VirtualDevice = require('../lib/virtual_device');
var LedJSON = require('./fixture/virtual_device.json');
var decompiler = require('calypso-query-decompiler');

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
  beforeEach(function(done) {
    cluster = zettatest()
      .server('cloud')
      .server('detroit1', [Scout], ['cloud'])
      .run(function(err){
        if (err) {
          return done(err);
        }

        detroit1 = cluster.servers['detroit1'];
        cloud = cluster.servers['cloud'];
        done();

      });
  });

  afterEach(function(done) {
    cluster.stop();
    setTimeout(done, 10); // fix issues with server not being closed before a new one starts
  });
  
  describe('remote query events', function() {

    it('should fire a remote query event on detroit1 after peers connect', function(done) {
      var query = cloud.runtime.from('detroit1').where({type: 'testdriver'});
      var ql = decompiler(query);
      var remove = 'select * ';
      if(ql.slice(0, remove.length) === remove) {
        ql = ql.slice(remove.length);
      }

      cloud.runtime.observe([query], function(testdriver){
      });
      detroit1.pubsub.subscribe('query/' + ql, function() {
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
          if(ev === 'query/'+ql) {
            done();
          }
        },
        name: 'detroit2'
      };

      cloud.pubsub.publish('_peer/connect', { peer: sock });

    });

  });
});

