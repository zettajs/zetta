var pubsub = require('../lib/pubsub_service');
var Runtime = require('../zetta_runtime');
var Scientist = Runtime.scientist;
var assert = require('assert');
var TestDriver = require('./fixture/example_driver');

describe('Driver', function() {

  it('should be attached to the zetta runtime', function() {
    assert.ok(Runtime.Device);
  });

  describe('Configuration', function() {
    it('should be configured by Scientist#configure', function() {
      var machine = Scientist.configure(TestDriver);
      assert.ok(machine.call);
      assert.equal(machine.type, 'testdriver');
      assert.equal(machine.state, 'ready');
      assert.equal(machine.name, 'Matt\'s Test Device');
    });
  });

  describe('Transitions', function() {
    var machine = null;

    beforeEach(function(){
      machine = Scientist.configure(TestDriver);
    });

    it('should change the state from ready to changed when calling change.', function(done) {
      machine.call('change', function() {
        assert.equal(machine.properties.state, 'changed');
        done();
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
  });
});
