var levelup = require('levelup');
var path = require('path');
var memdown = require('memdown');
var Runtime = require('../zetta_runtime');
var Scientist = require('../lib/scientist');
var assert = require('assert');
var util = require('util');
var Device = Runtime.Device;
var Registry = require('../lib/registry');
var Query = require('../lib/query');

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



var dbPath = path.join(__dirname, './.registry');

describe('Registry', function() {
  var db = null;
  var machine = null;

  beforeEach(function(done) {
    db = levelup(dbPath, { db: memdown });
    machine = Scientist.configure(TestDriver);
    done();
  });

  it('should call the callback on close', function(done) {
    var reg = new Registry(db);
    reg.close(function() {
      assert.equal(arguments.length, 0);
      done();
    });
  });

  it('should save a configured device to the database.', function(done) {
    var reg = new Registry(db);
    reg.save(machine, function(err) {
      assert.ok(!err);
      reg.close();
      done();
    });
  });

  it('should find a device by it\'s id.', function(done) {
    var reg = new Registry(db);
    reg.save(machine, function(err) {
      if(!err) {
        reg.get('123456789', function(err, value) {
          assert.ok(!err);
          assert.ok(value);
          var data = JSON.parse(value);
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
    var reg = new Registry(db);
    var q = new Query({type: 'test'});
    reg.save(machine, function(err) {
      if(!err) {
        reg.find(q, function(err, results) {
          assert.ok(!err);
          assert.ok(results);
          assert.equal(results.length, 1);
          var firstResult = results[0];
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
    var reg = new Registry(db);
    var q = new Query({type: 'foobar'});
    reg.save(machine, function(err) {
      if(!err) {
        reg.find(q, function(err, results) {
          assert.ok(!err);
          assert.ok(results);
          assert.equal(results.length, 0);
          reg.close();
          done();
        });
      }
    });
  });
});
