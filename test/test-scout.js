var assert = require("assert");
var util = require('util');
var zetta = require('../zetta_runtime');

var GoodScout = function() {
  zetta.Scout.call(this);
};
GoodScout.prototype.init = function(cb) { return cb(); };
util.inherits(GoodScout, zetta.Scout);

  
describe('Scout', function() {

  it('runtime should export zetta.Scout', function() {
    assert.ok(zetta.Scout);
  });

  describe('initialization of scout', function() {

    it('it should implement discover prototype', function() {
      var scout = new GoodScout();
      assert.ok(scout.discover);
    });

    it('it should implement provision prototype', function() {
      var scout = new GoodScout();
      assert.ok(scout.provision);
    });

  });


  describe('#discover()', function() {
    it.skip('it should pass arguments to device', function(cb) {
    });

    it.skip('it should add a new device to the registry', function(cb) {
    });
  });


  describe('#provision()', function() {
    it.skip('it should pass arguments to device', function(cb) {
    });

    it.skip('it should initiate device with registry information', function(cb) {
    });

    it.skip('should not return a device that has been already initialized', function(cb) {
    });
  });



});
