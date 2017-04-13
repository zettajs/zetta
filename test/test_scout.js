const assert = require('assert');
const mocks = require('./fixture/scout_test_mocks');
const zetta = require('../zetta_runtime');
const Runtime = require('../lib/runtime');
const GoodScout = mocks.GoodScout;
const GoodDevice = mocks.GoodDevice;
const MockRegistry = require('./fixture/mem_registry');


describe('Scout', () => {

  it('runtime should export zetta.Scout', () => {
    assert.ok(zetta.Scout);
  });

  describe('initialization of scout', () => {

    let scout = null;

    beforeEach(() => {
      scout = new GoodScout();
    });

    it('it should implement discover prototype', () => {
      assert.ok(scout.discover);
    });

    it('it should implement provision prototype', () => {
      assert.ok(scout.provision);
    });

  });


  describe('#discover()', () => {

    let runtime = null;

    beforeEach(() => {
      const registry = new MockRegistry();
      runtime = new Runtime({registry: registry});
    });

    it('it should pass arguments to device', done => {

      const scout = new GoodScout();
      scout.server = runtime;

      runtime.on('deviceready', machine => {
        assert.equal(machine.foo, 'foo');
        assert.equal(machine.bar, 'bar');
        done();
      });

      scout.init(() => {});

    });

    it('it should add a new device to the registry', done => {
      const scout = new GoodScout();
      scout.server = runtime;

      runtime.on('deviceready', machine => {
        assert.ok(machine);
        assert.equal(machine.type, 'test');
        assert.equal(machine.vendorId, '1234567');
        done();
      });

      scout.init(() => {});
    });
  });


  describe('#provision()', () => {

    let runtime = null;

    beforeEach(done => {

      GoodScout.prototype.init = function(cb){
        const query = this.server.where({type:'test', vendorId:'1234567'});
        const self = this;
        this.server.find(query, (err, results) => {
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

      const registry = new MockRegistry();
      
      registry.db.put('BC2832FD-9437-4473-A4A8-AC1D56B12C6F', {id:'BC2832FD-9437-4473-A4A8-AC1D56B12C6F',type:'test', vendorId:'1234567', foo:'foo', bar:'bar', name:'Test Device'}, {valueEncoding: 'json'}, err => {
        if (err) {
          done(err);
          return;
        }
        runtime = new Runtime({registry: registry});
        done();
      });
    });


    it('it should pass arguments to device', done => {

      const scout = new GoodScout();
      scout.server = runtime;

      runtime.on('deviceready', machine => {
        assert.equal(machine.foo, 'foo1');
        assert.equal(machine.bar, 'foo2');
        done();
      });

      scout.init(() => {});

    });

    it('it should initiate device with registry information', done => {
      const scout = new GoodScout();
      scout.server = runtime;

      runtime.on('deviceready', machine => {
        assert.equal(machine.name, 'Good Device:foo1');
        assert.equal(machine.type, 'test');
        done();
      });

      scout.init(() => {});
    });

    it('should not return a device that has been already initialized', done => {
      GoodScout.prototype.init = function(cb){
        const query = this.server.where({type:'test', vendorId:'1234567'});
        const self = this;
        this.server.find(query, (err, results) => {
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

      const scout = new GoodScout();
      scout.server = runtime;
      scout.init(() => {
      });
    });


    it('device init.name() should take presedence over registry value', done => {
      GoodScout.prototype.init = function(cb){
        const query = this.server.where({type:'test', vendorId:'1234567'});
        const self = this;
        this.server.find(query, (err, results) => {
          const device = self.provision(results[0], GoodDevice, 'foo1', 'foo2');
          assert.equal(device.name, 'Good Device:foo1');
          done();
        });
      };

      const scout = new GoodScout();
      scout.server = runtime;
      scout.init(() => {});
    });

  });



});
