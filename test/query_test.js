var Query = require('../lib/query');
var assert = require('assert');

describe('Query', function() {
  describe('Constructor', function() {
    it('implements the .match() prototype.', function() {
      var q = new Query({});
      assert.ok(q.match);
    });
  });

  describe('match()', function() {
    it('matches on matching parameters', function() {
      var q = new Query({test: 'foo', baz: 'bar'});

      var obj = { test: 'foo', baz: 'bar' };

      assert.ok(q.match(obj));
    });

    it('will not matching on non-matching parameters', function() {
      var q = new Query({test: 'foo', baz: 'bar'});

      var obj = { test: 'quux', bar: 'baz' };

      assert.ok(!q.match(obj));
    });

    it('will match everything when an asterisk is the only parameter provided.', function() {
      var q = new Query('*');
      var obj = { test: 'quux', bar: 'baz' };
      var obj2 = { test: 'foo', baz: 'bar' };
      assert.ok(q.match(obj));
      assert.ok(q.match(obj2));
    });
  });
});
