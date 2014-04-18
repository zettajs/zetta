var slice = Array.prototype.slice;

var Observable = module.exports = function(wrapped) {
  this.wrapped = wrapped;
};

Observable.prototype._wrapFn = function(name, args) {
  this.wrapped = this.wrapped[name].apply(this.wrapped, slice.call(args));
};

var passthrough = ['subscribe', 'take', 'takeWhile',
                   'first', 'timeout', 'catch', 'dispose'];

passthrough.forEach(function(fn) {
  Observable.prototype[fn] = function() {
    this._wrapFn(fn, arguments);
    return this;
  };
});

Observable.prototype.zip = function() {
  var args = slice.call(arguments);
  if (typeof args[args.length - 1] !== 'function') {
    args.push(function() {
      return slice.call(arguments);
    });
  }

  this._wrapFn('zip', args);
  return this;
};

Observable.create = function(wrapped) {
  return new Observable(wrapped);
};
