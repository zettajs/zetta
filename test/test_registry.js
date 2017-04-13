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

TestDriver.prototype.init = config => {
  config
    .name('Test')
    .type('test')
    .state('ready');
};

const dbPath = path.join(__dirname, './.registry');

describe('DeviceRegistry', () => {
  let db = null;
  let machine = null;
  let opts = null;

  beforeEach(done => {
    db = levelup(dbPath, { db: memdown });
    machine = Scientist.create(TestDriver);
    Scientist.init(machine);
    opts = { db, collection: 'devices' };
    done();
  });

  it('should call the callback on close', done => {
    const reg = new DeviceRegistry(opts);
    reg.close(function(...args) {
      assert.equal(args.length, 0);
      done();
    });
  });

  it('should save a configured device to the database.', done => {
    const reg = new DeviceRegistry(opts);
    reg.save(machine, err => {
      assert.ok(!err);
      reg.close();
      done();
    });
  });

  describe('#find', () => {
    it('should find a device by it\'s id.', done => {
      const reg = new DeviceRegistry(opts);
      reg.save(machine, err => {
        if(!err) {
          reg.get('123456789', (err, value) => {
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

    it('should have a callback return results in the callback of find.', done => {
      const reg = new DeviceRegistry(opts);
      reg.save(machine, err => {
        if(!err) {
          reg.find({ type: 'test' }, (err, results) => {
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

    it('should return no results in the callback of find with a query that does not match.', done => {
      const reg = new DeviceRegistry(opts);
      reg.save(machine, err => {
        if(!err) {
          reg.find({ type: 'foobar' }, (err, results) => {
            assert.ok(!err);
            assert.ok(results);
            assert.equal(results.length, 0);
            reg.close();
            done();
          });
        }
      });
    });

    it('should return results with a query language query', done => {
        const reg = new DeviceRegistry(opts);
        reg.save(machine, err => {
          if(!err) {
            reg.find('where type="test"', (err, results) => {
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

    it('should return results with a Query object', done => {
        const reg = new DeviceRegistry(opts);
        reg.save(machine, err => {
          if(!err) {
            const query = Query.of('devices')
              .where('type', { eq: 'test' });

            reg.find(query, (err, results) => {
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

    it('should return results with a parameterized Query object', done => {
        const reg = new DeviceRegistry(opts);
        reg.save(machine, err => {
          if(!err) {
            const query = Query.of('devices')
              .ql('where type=@type')
              .params({ type: 'test' });

            reg.find(query, (err, results) => {
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
