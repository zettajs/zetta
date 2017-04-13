const util = require('util');
const PubSub = require('../lib/pubsub_service');
const Logger = require('../lib/logger');
const Runtime = require('../zetta_runtime');
const Device = Runtime.Device;
const Scientist = require('zetta-scientist');
const assert = require('assert');
const SensorDriver = require('./fixture/sensor_driver');
const TestDriver = require('./fixture/example_driver');
const MemRegistry = require('./fixture/mem_registry');

describe('Driver', () => {
  let machine = null;
  let pubsub = null;
  let log = null;
  let reg = null;

  beforeEach(() => {
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

  it('should be attached to the zetta runtime', () => {
    assert.ok(Runtime.Device);
  });

  it('should expose an enableStream function', () => {
    assert.ok(Device.prototype.enableStream);  
  });
  
  it('should expose a disableStream function', () => {
    assert.ok(Device.prototype.disableStream);
  });

  describe('Configuration', () => {
    it('should be configured by Scientist#configure', () => {
      assert.ok(machine.call);
      assert.equal(machine.type, 'testdriver');
      assert.equal(machine.state, 'ready');
      assert.equal(machine.name, 'Matt\'s Test Device');
    });

    it('should have an id automatically generated for it', () => {
      assert.ok(machine.id);
    });

    it('should have properties function', () => {
      assert.equal(typeof machine.properties, 'function');
    });

    it('properties function should return filtered property list', () => {
      machine._foo = 123;
      const p = machine.properties();
      assert.equal(p._foo, undefined);
    });

  });

  describe('Logging', () => {
    it('should expose a .log method', () => {
      assert.equal(typeof machine.log, 'function');
    });

    it('should have log level functions', () => {
      assert.ok(machine.log);
      assert.ok(machine.info);
      assert.ok(machine.warn);
      assert.ok(machine.error);
    });
  });


  describe('Transitions', () => {

    it('should not throw when calling an invalid transition name.', done => {
      machine.call('not-a-transition', err => {
        assert(err);
        done();
      });
    });

    it('should not throw when calling a transition when destroyed.', done => {
      machine.state = 'zetta-device-destroy';
      machine.call('prepare', err => {
        assert(err);
        assert.equal(err.message, 'Machine destroyed. Cannot use transition prepare');
        done();
      });
    });

    it('should not throw when calling a transition not allowed in invalid state.', done => {
      machine.state = 'not-a-state';
      machine.call('prepare', err => {
        assert(err);
        done();
      });
    });

    it('avialable transitions should not throw when in invalid state.', done => {
      machine.state = 'not-a-state';
      machine.transitionsAvailable();
      done();
    });

    it('should change the state from ready to changed when calling change.', done => {
      machine.call('change', () => {
        assert.equal(machine.state, 'changed');
        done();
      });
    });

    it('should be able to call transiton afterchange after change was called', done => {
      machine.call('change', () => {
        assert.equal(machine.state, 'changed');
        machine.call('prepare', err => {
          assert.equal(machine.state, 'ready');
          done();
        });
      });
    });

    it('should not throw an error when a disallowed transition tries to happen.', done => {
      assert.doesNotThrow(() => {
        machine.call('change', () => {
          machine.call('change');
          done();
        });
      });
    });

    it('should return error in callback.', done => {
      machine.call('error', 'some error', err => {
        assert(err instanceof Error);
        done();
      });
    });

    it('should have transitions emitted like events.', done => {
      machine.on('change', () => {
        done();
      });

      machine.call('change');
    });

    it('should publish transitions to pubsub', done => {
      const topic = `${machine.type}/${machine.id}/logs`;
      
      let recv = 0;
      pubsub.subscribe(topic, (topic, msg) => {
        assert.ok(msg.timestamp);
        assert.ok(msg.topic);
        assert.ok(!msg.data);
        assert.ok(msg.properties);
        assert.ok(msg.input);
        assert.ok(msg.transition);
        recv++;
      });
      machine.call('change');
      setImmediate(() => {
        assert.equal(recv, 1);
        done();
      });
    });

    it('should publish transitions to logs', done => {
      let recv = 0;
      pubsub.subscribe('logs', (topic, msg) => {
        assert.ok(msg.timestamp);
        assert.ok(msg.topic);
        assert.ok(!msg.data);
        assert.ok(msg.properties);
        assert.ok(msg.input);
        assert.ok(msg.transition);
        recv++;
      });
      machine.call('change');
      setImmediate(() => {
        assert.equal(recv, 1);
        done();
      });
    });

    it('transitionsAvailable should return proper transitions', () => {
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

  describe('Monitors', () => {
    
    it('should be able to read state property', () => {
      assert.equal(machine.state, 'ready');
    });

    it('should be able to read monitors properties', () => {
      assert.equal(machine.foo, 0);
      machine.foo = 1;
      assert.equal(machine.foo, 1);
    });

    it('should be able to pass disable option to monitor', () => {
      assert.equal(machine._streams['disabledMonitor'].enabled, false);
      assert.equal(machine._streams['enabledMonitor'].enabled, true);
    });
  });

  describe('Streams', () => {

    function wireUpPubSub(stream, done){
      pubsub.publish = (name, data) => {
        assert.ok(name);
        assert.ok(data);
        assert.ok(name.indexOf(stream) > -1);
        done();
      }
    }

    it('should stream values of foo once configured', done => {
      assert.ok(machine.streams.foo);
      wireUpPubSub('foo', done);
      machine.foo++;
    });

    it('should be able to pass disable option to stream', () => {
      assert.equal(machine._streams['disabledStream'].enabled, false);
      assert.equal(machine._streams['enabledStream'].enabled, true);
    });

    it('should have createReadSteam on device', () => {
      assert.ok(machine.createReadStream);
      assert.ok(machine.createReadStream('foo'));
    });

    it('createReadStream should return values from stream', done => {
      const s = machine.createReadStream('foo');
      s.on('data', () => {
        done();
      });
      machine.foo++;
    });

    it('createReadStream stream when paused shoud not recieve any updates', done => {
      const s = machine.createReadStream('foo');
      let recv = 0;
      s.on('data', () => {
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

    it('should stream values of bar once configured', done => {
      assert.ok(machine.streams.bar);
      wireUpPubSub('bar', done);
      machine.incrementStreamValue();
    });

    it('should create a state stream when transitions are present', () => {
      assert.ok(machine.streams.state);
    });

    it('should not create a state stream when no transitions are present', () => {
      const machine = Scientist.init(Scientist.create(SensorDriver));
      assert(!machine.streams.state);
    });
  });

  describe('Device.save', () => {
    
    it('save should be implemented on device', () => {
      assert.equal(typeof machine.save, 'function');
    });

    it('save should update the registry with new property values', cb => {
      
      reg.get(machine.id, (err, result) => {
        assert(err);
        
        machine.someval = 123;
        machine._hidden = 'some-string';
        machine.save(err => {
          assert(!err);
          
          reg.get(machine.id, (err, result) => {
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

  describe('Remote Update and Fetch Hooks', () => {

    it('can pass config a remoteFetch function to be called when .properties() is called', () => {
      const Device = Runtime.Device;
      const SomeDevice = function() {
        this.hidden = 'hidden prop';
        Device.call(this);
      };
      util.inherits(SomeDevice, Device);
      SomeDevice.prototype.init = config => {
        config
          .type('some-device')
          .name('device-1')
          .remoteFetch(function() {
            assert.equal(this.hidden, 'hidden prop');
            return { prop: 123 };
          })
      };

      const machine = Scientist.init(Scientist.create(SomeDevice));
      assert.deepEqual(machine.properties(), { 
        name: 'device-1',
        prop: 123,
        type: 'some-device',
        id: machine.id
      });
    })

    it('handle remote update method, will update non reserved properties and remove old properties', done => {
      const Device = Runtime.Device;
      const SomeDevice = function() {
        this.ip = '1.2.3.4';
        this.mutable = 'abc';
        this.deleted = 'gone after update';
        Device.call(this);
      };
      util.inherits(SomeDevice, Device);
      SomeDevice.prototype.init = config => {
        config
          .type('some-device')
          .name('device-1');
      };

      const machine = Scientist.init(Scientist.create(SomeDevice));
      machine._registry = reg;
      machine._pubsub = pubsub;
      machine._log = log;
      machine._handleRemoteUpdate({ mutable: 123 }, err => {
        assert.equal(err, null);
        assert.equal(machine.ip, undefined);
        assert.equal(machine.mutable, 123);
        assert.equal(machine.deleted, undefined);
        done();
      });
    })


    it('can pass config a remoteUpdate function to be called when remoteUpdates are called', done => {
      const Device = Runtime.Device;
      const SomeDevice = function() {
        this.ip = '1.2.3.4';
        this.mutable = 'abc';
        this.deleted = 'gone after update';
        Device.call(this);
      };
      util.inherits(SomeDevice, Device);
      SomeDevice.prototype.init = config => {
        config
          .type('some-device')
          .name('device-1')
          .remoteUpdate(function(properties, cb) {
            const self = this;
            // make sure ip cant be updated
            delete properties.ip;

            Object.keys(properties).forEach(key => {
              self[key] = properties[key];
            });

            this.save(cb);
          })
      };

      const machine = Scientist.init(Scientist.create(SomeDevice));
      machine._registry = reg;
      machine._pubsub = pubsub;
      machine._log = log;
      machine._handleRemoteUpdate({ mutable: 123 }, err => {
        assert.equal(err, null);
        assert.equal(machine.ip, '1.2.3.4');
        assert.equal(machine.mutable, 123);
        done();
      });
    });
  });

  describe('Deletion', () => {
    it('should have a destroy function', () => {
      assert.ok(machine.destroy);  
    });     

    it('should emit a destroy event when destroy is called.', done => {
      machine.on('destroy', m => {
        assert.ok(m);
        done();  
      });  
      machine.destroy();
    });

    it('handle remote destroy method, will return true by default', done => {
      const Device = Runtime.Device;
      const SomeDevice = function() {
        this.ip = '1.2.3.4';
        this.mutable = 'abc';
        this.deleted = 'gone after update';
        Device.call(this);
      };
      util.inherits(SomeDevice, Device);
      SomeDevice.prototype.init = config => {
        config
          .type('some-device')
          .name('device-1');
      };

      const machine = Scientist.init(Scientist.create(SomeDevice));
      machine._registry = reg;
      machine._pubsub = pubsub;
      machine._log = log;
      machine._handleRemoteDestroy((err, destroyFlag) => {
        assert.equal(err, null);
        assert.equal(destroyFlag, true);
        done();
      });
    });
  });
});
