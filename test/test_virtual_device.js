var assert = require('assert');
var http = require('http');
var zettatest = require('./fixture/zetta_test');
var Scout = require('./fixture/example_scout');
var VirtualDevice = require('../lib/virtual_device');
var LedJSON = require('./fixture/virtual_device.json');

var mockSocket = {
  on: function(){},
  subscribe: function(topic, cb){
    if(cb) {
      cb();
    }
  },
  unsubscribe: function(){}
};

describe('Virtual Device', function() {
  var base = null;
  var cluster = null;
  var device = null;
  var socket = null;
  var deviceJson = null;
  var vdevice = null;

  beforeEach(function(done) {
    cluster = zettatest()
      .server('cloud')
      .server('detroit1', [Scout], ['cloud'])
      .run(function(err){
        if (err) {
          return cb(err);
        }
        socket = cluster.servers['cloud'].httpServer.peers[0];
        var did = Object.keys(cluster.servers['detroit1'].runtime._jsDevices)[0];
        device = cluster.servers['detroit1'].runtime._jsDevices[did];
        var id = cluster.servers['detroit1'].id;
        base = 'localhost:' + cluster.servers['cloud']._testPort + '/servers/' + cluster.servers['cloud'].locatePeer(id) + '/devices/' + did;

        http.get('http://' + base, function(res) {
          var buffer = [];
          var len = 0;
          res.on('readable', function() {
            var data;
            while (data = res.read()) {
              buffer.push(data);
              len += data.length;
            }
          });
          res.on('end', function() {
            var buf = Buffer.concat(buffer, len);
            deviceJson = JSON.parse(buf.toString());
            vdevice = new VirtualDevice(deviceJson, socket);
            vdevice.on('ready', function() {
              done();
            });
          });
          res.on('error', function(err) {
            done(err);
          });
        });
      });
  });

  afterEach(function(done) {
    cluster.stop();
    setTimeout(done, 10); // fix issues with server not being closed before a new one starts
  });
  
  describe('.call method', function() {

    it('call should work without arguments', function(done) {
      vdevice.call('change', function(err) {
        assert.equal(err, null);
      });
      var timer = setTimeout(function() {
        console.log('tiemr called')
        done(new Error('Faied to recv transition call on detroit device'));
      }, 100);

      device.on('change', function() {
        clearTimeout(timer);
        done();
      });
    });

    it('call should work with arguments', function(done) {
      vdevice.call('test', 'hello', function(err) {
        assert.equal(err, null);
      });
      var timer = setTimeout(function() {
        console.log('tiemr called')
        done(new Error('Faied to recv transition call on detroit device'));
      }, 100);

      device.on('test', function() {
        clearTimeout(timer);
        assert.equal(device.value, 'hello');
        done();
      });
    });

  });

  describe('Device log monitor stream', function() {

    it('should update virtual devices state when detroit device updates', function(done) {    
      assert.equal(vdevice.state, 'ready');
      device.call('change', function() {
        assert.equal(device.state, 'changed');
        setTimeout(function() {
          assert.equal(vdevice.state, 'changed');
          done();
        }, 100);
      });
    });

    it('should update virtual devices state when virtual device calls transition', function(done) {    
      assert.equal(vdevice.state, 'ready');
      vdevice.call('change', function() {
        assert.equal(device.state, 'changed');
        setTimeout(function() {
          assert.equal(vdevice.state, 'changed');
          done();
        }, 100);
      });
    });

  });



  describe('Device monitor streams on properties', function() {

    it('should update virtual device when value increments locally', function(done) {    
      assert.equal(vdevice.bar, 0);
      assert.equal(device.bar, 0);
      device.incrementStreamValue();
      assert.equal(device.bar, 1);
      setTimeout(function() {
        assert.equal(vdevice.bar, 1);
        done();
      }, 100);
    });

  });

  describe('basic unit tests', function() {

    var device = null;
    beforeEach(function() {
      device = new VirtualDevice(LedJSON , mockSocket);
    });
      
    it('wires up logs, properties, and actions', function() {
      assert.equal(device.state, 'off');
      assert.equal(Object.keys(device.streams).length, 2);
    });

    it('will change properties with update.', function() {
      device._update({ properties: {state: 'on'}});
      assert.equal(device.state, 'on');
    });

    it('will return the proper action given a name', function() {
      var action = device._getAction('turn-on');
      assert.ok(action);
      assert.equal(action.name, 'turn-on');
      assert.equal(action.fields.length, 1);
    });

    it('will return link given a title', function() {
      var link = device._getLinkWithTitle('state');
      assert.ok(link);
      assert.equal(link.title, 'state');
      assert.equal(link.rel[0], 'monitor');
      assert.equal(link.rel[1], 'http://rels.zettajs.io/object-stream');
    });

    it('will return an array of links if searched for by rel', function() {
      var links = device._getLinksWithRel('http://rels.zettajs.io/object-stream');
      assert.ok(links);
      assert.equal(links.length, 2);
      assert.ok(Array.isArray(links));
    });

    it('will parse out a topic for a particular link', function() {
      var link = device._getLinkWithTitle('state');
      var topic = device._getTopic(link);
      assert.equal(topic, 'led/0eaf8607-5b8c-45ee-afae-9a5f9e1f34e2/state');
    });

    it('will encode transition arguments into an object', function() {
      var action = device._getAction('turn-on');
      var data = device._encodeData(action, {});
      assert.ok(data);
      assert.equal(Object.keys(data)[0], 'action');
      assert.equal(data.action, 'turn-on');
    }); 
  });

});

