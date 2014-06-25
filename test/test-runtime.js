var assert = require('assert');

var zetta = require('../zetta');

describe('Runtime', function() {

  it('should be attached to the zetta as a function', function() {
    assert.equal(typeof zetta, 'function');
  });

});
