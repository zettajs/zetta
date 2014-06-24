var MachineConfig = require('./machine_config');

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

  var config = MachineConfig.create(machine);

  machine.init(config);

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
  var config = MachineConfig.create(machine);

  machine.init(config);

  return machine;
}
