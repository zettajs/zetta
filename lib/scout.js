var uuid = require('node-uuid');
var scientist = require('./scientist');

var Scout = module.exports = function() {
  this.server = null; // set when app.use initializes it
};

// add a new device to the registry
Scout.prototype.discover = function(constructor) {

  // TODO: add new device code
  var machine = scientist.configure.apply(null, arguments);
  machine.id = uuid.v4();
  machine.status = 'online';
  
  // save device in persistant store
  this.server.registry.save(machine, function(err){
  });

};


Scout.prototype.provision = function(deviceObject, constructor) {

  var args = Array.prototype.slice.call(arguments, 1);

  // TODO: add new device code
  var machine = scientist.configure.apply(null, args);
  machine.id = deviceObject.id;
  machine.name = deviceObject.name;
  machine.status = 'online';
  
  this.server.registry.save(machine, function(err){
  });
  
  return machine;
};

