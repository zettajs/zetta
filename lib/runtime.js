var Registry = require('./registry');

var Runtime = module.exports = function() {
  this.registry = new Registry();
};

//
Runtime.prototype.log = function() {};

// query related
Runtime.prototype.ql = function() {};
Runtime.prototype.where = function() {};


// obserable 
Runtime.prototype.observe = function() {};

// raw db - 
Runtime.prototype.find = function() {};
