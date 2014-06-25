var pubsub = require('../lib/pubsub_service');
var util = require('util');
var Runtime = require('../zetta_runtime');
var Device = Runtime.Device;
var Scientist = Runtime.scientist;
var assert = require('assert');


var TestDriver = function(){
  Device.call(this);
  this.data = 0;
};
util.inherits(TestDriver, Device);

TestDriver.prototype.init = function(config) {
  config
    .state('ready')
    .type('testdriver')
    .name('Matt\'s Test Device')
    .when('ready', { allow: ['change'] })
    .when('changed', { allow: ['prepare'] })
    .map('change', this.change)
    .map('prepare', this.prepare);
};

TestDriver.prototype.change = function(cb) {
  this.state = 'changed';
  cb();
};

TestDriver.prototype.prepare = function(cb) {
  this.state = 'ready';
  cb();
};

describe('Driver', function() {

  it('should be attached to the zetta runtime', function() {
    assert.ok(Runtime.Device);
  });

  describe('Configuration', function() {
    it('should be configured by Scientist#configure', function() {
      var machine = Scientist.configure(TestDriver);
      assert.ok(machine.call);
      assert.equal(machine.type, 'testdriver');
      assert.equal(machine.properties.state, 'ready');
      assert.equal(machine.properties.name, 'Matt\'s Test Device');
    });
  });

  describe('Transitions', function() {
    it('should change the state from ready to changed when calling change.', function(done) {
      var machine = Scientist.configure(TestDriver);
      machine.call('change', function() {
        assert.equal(machine.properties.state, 'changed');
        done();
      });
    });

    it('should throw an error when a disallowed transition tries to happen.', function(done) {
      var machine = Scientist.configure(TestDriver);
      machine.call('change', function() {
        try {
          machine.call('change');
        } catch (e) {
          assert.ok(e);
          done();
        }
      });
    });
  });
});
