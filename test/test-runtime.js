var assert = require('assert');

var zetta = require('../zetta');

describe('Runtime', function() {

  it('should be attached to the zetta as a function', function() {
    assert.equal(typeof zetta, 'function');
  });


  it('should be attached to the zetta as a function', function() {
    zetta()
      .name('local')
      .expose('*')
      .load(function(server) {})
      .listen(3000, function(err){
	console.log(err);
      });
  });



});
