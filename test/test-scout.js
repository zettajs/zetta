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

  });


  describe('#discover()', function() {

    it('it should pass arguments to discover event', function(cb) {
      var scout = new GoodScout();

      scout.once('discover', function(device, arg1, arg2, arg3){
	assert.equal(device, Device);
	assert.equal(arg1, 1);
	assert.equal(arg2, 2);
	assert.equal(arg3, 3);
	cb();
      });
      
      var Device = function(){};
      scout.discover(Device, 1, 2, 3);
    });

  });




});
