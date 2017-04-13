const Query = require('../lib/query');
const assert = require('assert');

describe('Query', () => {
  describe('Constructor', () => {
    it('implements the .match() prototype.', () => {
      const q = new Query({});
      assert.ok(q.match);
    });
  });

  describe('match()', () => {
    it('matches on matching parameters', () => {
      const q = new Query({test: 'foo', baz: 'bar'});

      const obj = { test: 'foo', baz: 'bar' };

      assert.ok(q.match(obj));
    });

    it('will not matching on non-matching parameters', () => {
      const q = new Query({test: 'foo', baz: 'bar'});

      const obj = { test: 'quux', bar: 'baz' };

      assert.ok(!q.match(obj));
    });

    it('will match everything when an asterisk is the only parameter provided.', () => {
      const q = new Query('*');
      const obj = { test: 'quux', bar: 'baz' };
      const obj2 = { test: 'foo', baz: 'bar' };
      assert.ok(q.match(obj));
      assert.ok(q.match(obj2));
    });
  });
});
