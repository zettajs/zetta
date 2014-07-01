var scientist = require('./scientist');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var Scout = module.exports = function() {
  this.server = null; // set when app.use initializes it
};

// add a new device to the registry
Scout.prototype.discover = function(constructor) {
  var self = this;
  var machine = scientist.configure.apply(null, arguments);

  // save device in persistant store
  self.server.registry.save(machine, function(err){
    self.server._jsDevices[machine.id] = machine;
    self.server.emit('deviceready', machine);
  });

};


Scout.prototype.provision = function(deviceObject, constructor) {

  // if already initiated on runtime do not create a second instnace
  if(this.server._jsDevices[deviceObject.id]) {
    return null;
  }

  var args = Array.prototype.slice.call(arguments, 1);

  // TODO: add new device code
  var machine = scientist.configure.apply(null, args);
  machine.id = deviceObject.id;
  machine.name = deviceObject.name;

  // add to list of initiated
  this.server._jsDevices[machine.id] = machine;

  this.server.registry.save(machine, function(err){

  });

  this.server.emit('deviceready', machine);
  return machine;
};
