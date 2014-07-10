
exports.configure = function(/* constructor, ...constructorArgs */) {
  var args = Array.prototype.slice.call(arguments);
  var constructor = args[0];
  var constructorArgs = args.length > 1 ? args.slice(1) : undefined;

  var machine;

  if (constructor.prototype) {
    machine = Object.create(constructor.prototype);
    machine.constructor.apply(machine, constructorArgs);
  } else if (constructor.init) {
    machine = constructor;
  }

  machine.init(machine);

  return machine;
};

exports.create = function(/* constructor, ...constructorArgs */) {
  var args = Array.prototype.slice.call(arguments);
  var constructor = args[0];
  var constructorArgs = args.length > 1 ? args.slice(1) : undefined;

  var machine;

  if (constructor.prototype) {
    machine = Object.create(constructor.prototype);
    machine.constructor.apply(machine, constructorArgs);
  } else if (constructor.init) {
    machine = constructor;
  }

  return machine;
};

exports.init = function(machine) {

  machine.init(machine);

  return machine;
}
