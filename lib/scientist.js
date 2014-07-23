var DeviceConfig = require('./device_config');

function init(machine) {
  var propsToCheck = ['_registry', '_log', '_pubsub'];
  
  propsToCheck.forEach(function(k) {
    if (machine[k] === 'undefined') {
      throw new Error('Trying to initialize device without needed property set.');
    } 
  });
  
  var config = new DeviceConfig();  
  machine.init(config);
  machine._generate(config);

  return machine;
}
exports.init = init;

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

  machine = init(machine);

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

