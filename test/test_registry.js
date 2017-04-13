const levelup = require('levelup');
const path = require('path');
const memdown = require('memdown');
const Runtime = require('../zetta_runtime');
const Scientist = require('zetta-scientist');
const assert = require('assert');
const util = require('util');
const Device = Runtime.Device;
const DeviceRegistry = require('../lib/device_registry');
const Query = require('calypso').Query;

function TestDriver() {
  Device.call(this);
  this.foo = 'fooData';
  this.bar = 'barData';
  this.id = '123456789';
}
util.inherits(TestDriver, Device);

TestDriver.prototype.init = function(config) {
  config
    .name('Test')
    .type('test')
    .state('ready');
};

const dbPath = path.join(__dirname, './.registry');

describe('DeviceRegistry', function() {
  let db = null;
  let machine = null;
  let opts = null;

  beforeEach(function(done) {
    db = levelup(dbPath, { db: memdown });
    machine = Scientist.create(TestDriver);
    Scientist.init(machine);
    opts = { db: db, collection: 'devices' };
    done();
  });

  it('should call the callback on close', function(done) {
    const reg = new DeviceRegistry(opts);
    reg.close(function() {
      assert.equal(arguments.length, 0);
      done();
    });
  });

  it('should save a configured device to the database.', function(done) {
    const reg = new DeviceRegistry(opts);
    reg.save(machine, function(err) {
      assert.ok(!err);
      reg.close();
      done();
    });
  });

  describe('#find', function() {
    it('should find a device by it\'s id.', function(done) {
      const reg = new DeviceRegistry(opts);
      reg.save(machine, function(err) {
        if(!err) {
          reg.get('123456789', function(err, value) {
            assert.ok(!err);
            assert.ok(value);
            const data = value;
            assert.equal(data.name, 'Test');
            assert.equal(data.type, 'test');
            assert.equal(data.id, '123456789');
            reg.close();
            done();
          });
        }
      });
    });

    it('should have a callback return results in the callback of find.', function(done) {
      const reg = new DeviceRegistry(opts);
      reg.save(machine, function(err) {
        if(!err) {
          reg.find({ type: 'test' }, function(err, results) {
            assert.ok(!err);
            assert.ok(results);
            assert.equal(results.length, 1);
            const firstResult = results[0];
            assert.equal(firstResult.type, 'test');
            assert.equal(firstResult.name, 'Test');
            assert.equal(firstResult.id, '123456789');
            reg.close();
            done();
          });
        }
      });
    });

    it('should return no results in the callback of find with a query that does not match.', function(done) {
      const reg = new DeviceRegistry(opts);
      reg.save(machine, function(err) {
        if(!err) {
          reg.find({ type: 'foobar' }, function(err, results) {
            assert.ok(!err);
            assert.ok(results);
            assert.equal(results.length, 0);
            reg.close();
            done();
          });
        }
      });
    });

    it('should return results with a query language query', function(done) {
        const reg = new DeviceRegistry(opts);
        reg.save(machine, function(err) {
          if(!err) {
            reg.find('where type="test"', function(err, results) {
              assert.ok(!err);
              assert.ok(results);
              assert.equal(results.length, 1);
              const firstResult = results[0];
              assert.equal(firstResult.type, 'test');
              assert.equal(firstResult.name, 'Test');
              assert.equal(firstResult.id, '123456789');
              reg.close();
              done();
            });
          }
        });
    });

    it('should return results with a Query object', function(done) {
        const reg = new DeviceRegistry(opts);
        reg.save(machine, function(err) {
          if(!err) {
            const query = Query.of('devices')
              .where('type', { eq: 'test' });

            reg.find(query, function(err, results) {
              assert.ok(!err);
              assert.ok(results);
              assert.equal(results.length, 1);
              const firstResult = results[0];
              assert.equal(firstResult.type, 'test');
              assert.equal(firstResult.name, 'Test');
              assert.equal(firstResult.id, '123456789');
              reg.close();
              done();
            });
          }
        });
    });

    it('should return results with a parameterized Query object', function(done) {
        const reg = new DeviceRegistry(opts);
        reg.save(machine, function(err) {
          if(!err) {
            const query = Query.of('devices')
              .ql('where type=@type')
              .params({ type: 'test' });

            reg.find(query, function(err, results) {
              assert.ok(!err);
              assert.ok(results);
              assert.equal(results.length, 1);
              const firstResult = results[0];
              assert.equal(firstResult.type, 'test');
              assert.equal(firstResult.name, 'Test');
              assert.equal(firstResult.id, '123456789');
              reg.close();
              done();
            });
          }
        });
    });
  });
});
