var assert = require('assert');
var http = require('http');
var zettatest = require('./fixture/zetta_test');
var Scout = require('./fixture/example_scout');
var VirtualDevice = require('../lib/virtual_device');

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
        }, 20);
      });
    });

    it('should update virtual devices state when virtual device calls transition', function(done) {    
      assert.equal(vdevice.state, 'ready');
      vdevice.call('change', function() {
        assert.equal(device.state, 'changed');
        setTimeout(function() {
          assert.equal(vdevice.state, 'changed');
          done();
        }, 20);
      });
    });

  });

});

