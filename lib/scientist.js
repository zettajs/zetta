
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
  var propsToCheck = ['_registry', '_log', '_pubsub'];
  
  propsToCheck.forEach(function(k) {
    if (machine[k] === 'undefined') {
      throw new Error('Trying to initialize device without needed property set.');
    } 
  });

  machine.init(machine);
  return machine;
}
