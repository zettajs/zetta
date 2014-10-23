var assert = require('assert');
var mocks = require('./fixture/scout_test_mocks');
var zetta = require('../zetta_runtime');
var Runtime = require('../lib/runtime');
var GoodScout = mocks.GoodScout;
var GoodDevice = mocks.GoodDevice;
var MockRegistry = require('./fixture/mem_registry');


describe('Scout', function() {

  it('runtime should export zetta.Scout', function() {
    assert.ok(zetta.Scout);
  });

  describe('initialization of scout', function() {

    var scout = null;

    beforeEach(function(){
      scout = new GoodScout();
    });

    it('it should implement discover prototype', function() {
      assert.ok(scout.discover);
    });

    it('it should implement provision prototype', function() {
      assert.ok(scout.provision);
    });

  });


  describe('#discover()', function() {

    var runtime = null;

    beforeEach(function(){
      var registry = new MockRegistry();
      runtime = new Runtime({registry: registry});
    });

    it('it should pass arguments to device', function(done) {

      var scout = new GoodScout();
      scout.server = runtime;

      runtime.on('deviceready', function(machine){
        assert.equal(machine.foo, 'foo');
        assert.equal(machine.bar, 'bar');
        done();
      });

      scout.init(function(){});

    });

    it('it should add a new device to the registry', function(done) {
      var scout = new GoodScout();
      scout.server = runtime;

      runtime.on('deviceready', function(machine){
        assert.ok(machine);
        assert.equal(machine.type, 'test');
        assert.equal(machine.vendorId, '1234567');
        done();
      });

      scout.init(function(){});
    });
  });


  describe('#provision()', function() {

    var runtime = null;

    beforeEach(function(done){

      GoodScout.prototype.init = function(cb){
        var query = this.server.where({type:'test', vendorId:'1234567'});
        var self = this;
        this.server.find(query, function(err, results){
          if(!err) {
            if(results.length) {
              self.provision(results[0], GoodDevice, 'foo1', 'foo2');
              self.provision(results[0], GoodDevice, 'foo1', 'foo2');
              cb();
            }
          } else {
            console.log('error:');
            console.log(err);
          }
        });
      };

      var registry = new MockRegistry();
      
      registry.db.put('BC2832FD-9437-4473-A4A8-AC1D56B12C6F', {id:'BC2832FD-9437-4473-A4A8-AC1D56B12C6F',type:'test', vendorId:'1234567', foo:'foo', bar:'bar', name:'Test Device'}, {valueEncoding: 'json'}, function(err) {
        if (err) {
          done(err);
          return;
        }
        runtime = new Runtime({registry: registry});
        done();
      });
    });


    it('it should pass arguments to device', function(done) {

      var scout = new GoodScout();
      scout.server = runtime;

      runtime.on('deviceready', function(machine){
        assert.equal(machine.foo, 'foo1');
        assert.equal(machine.bar, 'foo2');
        done();
      });

      scout.init(function(){});

    });

    it('it should initiate device with registry information', function(done) {
      var scout = new GoodScout();
      scout.server = runtime;

      runtime.on('deviceready', function(machine){
        assert.equal(machine.name, 'Good Device:foo1');
        assert.equal(machine.type, 'test');
        done();
      });

      scout.init(function(){});
    });

    it('should not return a device that has been already initialized', function(done) {
      GoodScout.prototype.init = function(cb){
        var query = this.server.where({type:'test', vendorId:'1234567'});
        var self = this;
        this.server.find(query, function(err, results){
          if(!err) {
            if(results.length) {
              assert.ok(self.provision(results[0], GoodDevice, 'foo1', 'foo2'));
              assert.ok(!self.provision(results[0], GoodDevice, 'foo1', 'foo2'));
              done();
              cb();
            }
          } else {
            console.log('error:');
            console.log(err);
          }

        });
      };

      var scout = new GoodScout();
      scout.server = runtime;
      scout.init(function(){
      });
    });


    it('device init.name() should take presedence over registry value', function(done) {
      GoodScout.prototype.init = function(cb){
        var query = this.server.where({type:'test', vendorId:'1234567'});
        var self = this;
        this.server.find(query, function(err, results){
          var device = self.provision(results[0], GoodDevice, 'foo1', 'foo2');
          assert.equal(device.name, 'Good Device:foo1');
          done();
        });
      };

      var scout = new GoodScout();
      scout.server = runtime;
      scout.init(function(){});
    });

  });



});
