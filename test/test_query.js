const Query = require('../lib/query');
const assert = require('assert');

describe('Query', function() {
  describe('Constructor', function() {
    it('implements the .match() prototype.', function() {
      const q = new Query({});
      assert.ok(q.match);
    });
  });

  describe('match()', function() {
    it('matches on matching parameters', function() {
      const q = new Query({test: 'foo', baz: 'bar'});

      const obj = { test: 'foo', baz: 'bar' };

      assert.ok(q.match(obj));
    });

    it('will not matching on non-matching parameters', function() {
      const q = new Query({test: 'foo', baz: 'bar'});

      const obj = { test: 'quux', bar: 'baz' };

      assert.ok(!q.match(obj));
    });

    it('will match everything when an asterisk is the only parameter provided.', function() {
      const q = new Query('*');
      const obj = { test: 'quux', bar: 'baz' };
      const obj2 = { test: 'foo', baz: 'bar' };
      assert.ok(q.match(obj));
      assert.ok(q.match(obj2));
    });
  });
});
