var assert = require('assert');
var path = require('path');
var Registry = require('../lib/registry');
var Query = require('calypso').Query;
var memdown = require('memdown');
var levelup = require('levelup');

var dbPath = path.join(__dirname, './.peers');

describe('Registry Compaction', function() {
  describe('custom database', function() {
    var db, opts;
    
    beforeEach(function(done) {
      db = levelup(dbPath, { db: memdown });
      opts = { db: db, collection: 'peers' };
      done();
    });

    afterEach(function(done) {
      if (db) {
        db.close(done);
      }
    });

    it('should not have a compactor property with a custom db.', function() {
      var reg = new Registry(opts);
      assert.ok(!reg.compactor); 
    });  
    
  });
  
  describe('standard medea database', function() {
    var reg;
    var opts = {
      collection: 'peer',
      path: './.peers'
    };

    beforeEach(function(done) {
      reg = new Registry(opts); 
      done();
    });

    afterEach(function(done) {
      if(reg.db) {
        reg.close(done);
      } else {
        done();
      }
    });

    it('should have a compactor property without a custom db.', function() { 
      assert.ok(reg.compactor);
    });

    it('should call open before compact.', function(done) {
      var compactor = {};

      compactor.open = function(path, cb) {
        assert.ok(path);
        assert.ok(cb);
        done();
      };

      reg.compactor = compactor;
      reg._init(function(e) {
          
      });
    });

    it('should call compact.', function(done) { 
      var compactor = {};

      compactor.open = function(path, cb) {
        assert.ok(path);
        assert.ok(cb);
        done();
      };

      compactor.compact = function(cb) {
        assert.ok(cb);
        done();
      };

      reg.compactor = compactor;
      reg._init(function(e) {
          
      });
    });  

    it('should call close.', function(done) {
      var compactor = {};

      compactor.open = function(path, cb) {
        assert.ok(path);
        assert.ok(cb);
        done();
      };

      compactor.compact = function(cb) {
        assert.ok(cb);
        done();
      };

      compactor.close = function(cb) {
        assert.ok(cb);
        done();
      };

      reg.compactor = compactor;
      reg._init(function(e) {
          
      });
    });
  });
});
