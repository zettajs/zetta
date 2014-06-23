var util = require('util');
var EventEmitter = require("events").EventEmitter;

var Scout = module.exports = function() {
  EventEmitter.call(this);
};
util.inherits(Scout, EventEmitter);

// Discover emits 'discover' event.
Scout.prototype.discover = function(constructor) {
  var args = Array.prototype.slice.call(arguments, 0);
  args.unshift('discover');

  // call emit('discover', constructor, arg1, arg2 ...);
  this.emit.apply(this, args);
};
