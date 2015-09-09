var util = require('util');
var PubSub = require('../lib/pubsub_service');
var Logger = require('../lib/logger');
var Runtime = require('../zetta_runtime');
var Device = Runtime.Device;
var Scientist = require('zetta-scientist');
var assert = require('assert');
var SensorDriver = require('./fixture/sensor_driver');
var TestDriver = require('./fixture/example_driver');
var MemRegistry = require('./fixture/mem_registry');

describe('Driver', function() {
  var machine = null;
  var pubsub = null;
  var log = null;
  var reg = null;

  beforeEach(function(){
    reg = new MemRegistry();
    pubsub = new PubSub();
    log = new Logger({pubsub: pubsub});
    log.pubsub = pubsub;
    // create machine
    machine = Scientist.create(TestDriver);
    machine._pubsub = pubsub; // setup pubsub, log, registry
    machine._log = log;
    machine._registry = reg;

    // init machine
    machine = Scientist.init(machine);
  });

  it('should be attached to the zetta runtime', function() {
    assert.ok(Runtime.Device);
  });

  it('should expose an enableStream function', function() {
    assert.ok(Device.prototype.enableStream);  
  });
  
  it('should expose a disableStream function', function() {
    assert.ok(Device.prototype.disableStream);
  });

  describe('Configuration', function() {
    it('should be configured by Scientist#configure', function() {
      assert.ok(machine.call);
      assert.equal(machine.type, 'testdriver');
      assert.equal(machine.state, 'ready');
      assert.equal(machine.name, 'Matt\'s Test Device');
    });

    it('should have an id automatically generated for it', function(){
      assert.ok(machine.id);
    });

    it('should have properties function', function() {
      assert.equal(typeof machine.properties, 'function');
    });

    it('properties function should return filtered property list', function() {
      machine._foo = 123;
      var p = machine.properties();
      assert.equal(p._foo, undefined);
    });

  });

  describe('Logging', function() {
    it('should expose a .log method', function() {
      assert.equal(typeof machine.log, 'function');
    });

    it('should have log level functions', function() {
      assert.ok(machine.log);
      assert.ok(machine.info);
      assert.ok(machine.warn);
      assert.ok(machine.error);
    });
  });


  describe('Transitions', function() {

    it('should not throw when calling an invalid transition name.', function(done) {
      machine.call('not-a-transition', function(err) {
        assert(err);
        done();
      });
    });

    it('should not throw when calling a transition when destroyed.', function(done) {
      machine.state = 'zetta-device-destroy';
      machine.call('prepare', function(err) {
        assert(err);
        assert.equal(err.message, 'Machine destroyed. Cannot use transition prepare');
        done();
      });
    });

    it('should not throw when calling a transition not allowed in invalid state.', function(done) {
      machine.state = 'not-a-state';
      machine.call('prepare', function(err) {
        assert(err);
        done();
      });
    });

    it('avialable transitions should not throw when in invalid state.', function(done) {
      machine.state = 'not-a-state';
      machine.transitionsAvailable();
      done();
    });

    it('should change the state from ready to changed when calling change.', function(done) {
      machine.call('change', function() {
        assert.equal(machine.state, 'changed');
        done();
      });
    });

    it('should be able to call transiton afterchange after change was called', function(done) {
      machine.call('change', function() {
        assert.equal(machine.state, 'changed');
        machine.call('prepare', function(err) {
          assert.equal(machine.state, 'ready');
          done();
        });
      });
    });

    it('should not throw an error when a disallowed transition tries to happen.', function(done) {
      assert.doesNotThrow(function(){
        machine.call('change', function() {
          machine.call('change');
          done();
        });
      });
    });

    it('should return error in callback.', function(done) {
      machine.call('error', 'some error', function(err) {
        assert(err instanceof Error);
        done();
      });
    });

    it('should have transitions emitted like events.', function(done) {
      machine.on('change', function() {
        done();
      });

      machine.call('change');
    });

    it('should publish transitions to pubsub', function(done) {
      var topic = machine.type + '/' + machine.id + '/logs';
      
      var recv = 0;
      pubsub.subscribe(topic, function(topic, msg) {
        assert.ok(msg.timestamp);
        assert.ok(msg.topic);
        assert.ok(!msg.data);
        assert.ok(msg.properties);
        assert.ok(msg.input);
        assert.ok(msg.transition);
        recv++;
      });
      machine.call('change');
      setImmediate(function() {
        assert.equal(recv, 1);
        done();
      });
    });

    it('should publish transitions to logs', function(done) {
      var recv = 0;
      pubsub.subscribe('logs', function(topic, msg) {
        assert.ok(msg.timestamp);
        assert.ok(msg.topic);
        assert.ok(!msg.data);
        assert.ok(msg.properties);
        assert.ok(msg.input);
        assert.ok(msg.transition);
        recv++;
      });
      machine.call('change');
      setImmediate(function() {
        assert.equal(recv, 1);
        done();
      });
    });

    it('transitionsAvailable should return proper transitions', function() {
      //.when('ready', { allow: ['change', 'test'] })
      //.when('changed', { allow: ['prepare', 'test'] })
      
      machine.state = 'ready';
      var transitions = machine.transitionsAvailable();
      assert(Object.keys(transitions).indexOf('change') > -1);
      assert(Object.keys(transitions).indexOf('test') > -1);

      machine.state = 'changed';
      var transitions = machine.transitionsAvailable();
      assert(Object.keys(transitions).indexOf('prepare') > -1);
      assert(Object.keys(transitions).indexOf('test') > -1);

    });
  });

  describe('Monitors', function(){
    
    it('should be able to read state property', function() {
      assert.equal(machine.state, 'ready');
    });

    it('should be able to read monitors properties', function() {
      assert.equal(machine.foo, 0);
      machine.foo = 1;
      assert.equal(machine.foo, 1);
    });
  });

  describe('Streams', function(){

    function wireUpPubSub(stream, done){
      pubsub.publish = function(name, data){
        assert.ok(name);
        assert.ok(data);
        assert.ok(name.indexOf(stream) > -1);
        done();
      }
    }

    it('should stream values of foo once configured', function(done){
      assert.ok(machine.streams.foo);
      wireUpPubSub('foo', done);
      machine.foo++;
    });

    it('should have createReadSteam on device', function(){
      assert.ok(machine.createReadStream);
      assert.ok(machine.createReadStream('foo'));
    });

    it('createReadStream should return values from stream', function(done){
      var s = machine.createReadStream('foo');
      s.on('data', function() {
        done();
      });
      machine.foo++;
    });

    it('createReadStream stream when paused shoud not recieve any updates', function(done){
      var s = machine.createReadStream('foo');
      var recv = 0;
      s.on('data', function() {
        recv++;
        if (recv === 1) {
          s.pause();
          machine.foo++;
          setTimeout(done, 10);
        } else {
          throw new Error('Should not recieve more than one data event');
        }
      });
      machine.foo++;
    });

    it('should stream values of bar once configured', function(done){
      assert.ok(machine.streams.bar);
      wireUpPubSub('bar', done);
      machine.incrementStreamValue();
    });

    it('should create a state stream when transitions are present', function() {
      assert.ok(machine.streams.state);
    });

    it('should not create a state stream when no transitions are present', function() {
      var machine = Scientist.init(Scientist.create(SensorDriver));
      assert(!machine.streams.state);
    });
  });

  describe('Device.save', function() {
    
    it('save should be implemented on device', function() {
      assert.equal(typeof machine.save, 'function');
    });

    it('save should update the registry with new property values', function(cb) {
      
      reg.get(machine.id, function(err, result) {
        assert(err);
        
        machine.someval = 123;
        machine._hidden = 'some-string';
        machine.save(function(err) {
          assert(!err);
          
          reg.get(machine.id, function(err, result) {
            assert.equal(err, null);
            assert.equal(result.id, machine.id);
            assert.equal(result.someval, 123);
            assert.equal(typeof result._hidden, 'undefined');
            cb();
          });
        });
      });
    });
    
  });

  describe('Remote Update and Fetch Hooks', function() {

    it('can pass config a remoteFetch function to be called when .properties() is called', function() {
      var Device = Runtime.Device;
      var SomeDevice = function() {
        this.hidden = 'hidden prop';
        Device.call(this);
      };
      util.inherits(SomeDevice, Device);
      SomeDevice.prototype.init = function(config) {
        config
          .type('some-device')
          .name('device-1')
          .remoteFetch(function() {
            assert.equal(this.hidden, 'hidden prop');
            return { prop: 123 };
          })
      };

      var machine = Scientist.init(Scientist.create(SomeDevice));
      assert.deepEqual(machine.properties(), { 
        name: 'device-1',
        prop: 123,
        type: 'some-device',
        id: machine.id
      });
    })

    it('handle remote update method, will update non reserved properties and remove old properties', function(done) {
      var Device = Runtime.Device;
      var SomeDevice = function() {
        this.ip = '1.2.3.4';
        this.mutable = 'abc';
        this.deleted = 'gone after update';
        Device.call(this);
      };
      util.inherits(SomeDevice, Device);
      SomeDevice.prototype.init = function(config) {
        config
          .type('some-device')
          .name('device-1');
      };

      var machine = Scientist.init(Scientist.create(SomeDevice));
      machine._registry = reg;
      machine._pubsub = pubsub;
      machine._log = log;
      machine._handleRemoteUpdate({ mutable: 123 }, function(err) {
        assert.equal(err, null);
        assert.equal(machine.ip, undefined);
        assert.equal(machine.mutable, 123);
        assert.equal(machine.deleted, undefined);
        done();
      });
    })


    it('can pass config a remoteUpdate function to be called when remoteUpdates are called', function(done) {
      var Device = Runtime.Device;
      var SomeDevice = function() {
        this.ip = '1.2.3.4';
        this.mutable = 'abc';
        this.deleted = 'gone after update';
        Device.call(this);
      };
      util.inherits(SomeDevice, Device);
      SomeDevice.prototype.init = function(config) {
        config
          .type('some-device')
          .name('device-1')
          .remoteUpdate(function(properties, cb) {
            var self = this;
            // make sure ip cant be updated
            delete properties.ip;

            Object.keys(properties).forEach(function(key) {
              self[key] = properties[key];
            });

            this.save(cb);
          })
      };

      var machine = Scientist.init(Scientist.create(SomeDevice));
      machine._registry = reg;
      machine._pubsub = pubsub;
      machine._log = log;
      machine._handleRemoteUpdate({ mutable: 123 }, function(err) {
        assert.equal(err, null);
        assert.equal(machine.ip, '1.2.3.4');
        assert.equal(machine.mutable, 123);
        done();
      });
    });
  });

  describe('Deletion', function() {
    it('should have a destroy function', function() {
      assert.ok(machine.destroy);  
    });     

    it('should emit a destroy event when destroy is called.', function(done) {
      machine.on('destroy', function(m) {
        assert.ok(m);
        done();  
      });  
      machine.destroy();
    });

    it('handle remote destroy method, will return true by default', function(done) {
      var Device = Runtime.Device;
      var SomeDevice = function() {
        this.ip = '1.2.3.4';
        this.mutable = 'abc';
        this.deleted = 'gone after update';
        Device.call(this);
      };
      util.inherits(SomeDevice, Device);
      SomeDevice.prototype.init = function(config) {
        config
          .type('some-device')
          .name('device-1');
      };

      var machine = Scientist.init(Scientist.create(SomeDevice));
      machine._registry = reg;
      machine._pubsub = pubsub;
      machine._log = log;
      machine._handleRemoteDestroy(function(err, destroyFlag) {
        assert.equal(err, null);
        assert.equal(destroyFlag, true);
        done();
      });
    });
  });
});
