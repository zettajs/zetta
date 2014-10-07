var PubSub = require('../lib/pubsub_service');
var Logger = require('../lib/logger');
var Runtime = require('../zetta_runtime');
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

  describe('Transitions', function() {

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

    it('should throw an error when a disallowed transition tries to happen.', function(done) {
      machine.call('change', function() {
        try {
          machine.call('change');
        } catch (e) {
          assert.ok(e);
          done();
        }
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

  describe('Streams', function() {
    
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


});
