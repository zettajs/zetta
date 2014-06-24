var util = require('util');
var Scout = require('../../zetta_runtime').Scout;

var Hub = function(hubJson) {
  this.type = 'huehub';
  this.state = 'unregistered';

  this.hueId = hubJson.id;
  this.ipaddress = hubJson.ipaddress;
  this.credentails = null;
  this._dontSaveMe = 123;
};

Hub.prototype.init = function(config) {
  
};





var HubScout = module.exports = function() {
  this.count = 0;
  this.interval = 5000;
  Scout.call(this);
};
util.inherits(HubScout, Scout);

HubScout.prototype.init = function(cb) {
  this.search();
  setInterval(this.search.bind(this), this.interval);
  cb();
};

HubScout.prototype.search = function() {
  var self = this;

  var hubs = [{id: '1234567890', 'ipaddress': '192.168.1.0'}];

  setTimeout(function() {
    hubs.forEach(function(hub) {
      self._foundHub(hub);
    });
  }, 200);
};

HubScout.prototype._foundHub = function(hueHub) {
  var self = this;
  var hubQuery = self.server.where({type: 'huehub', hueId: hueHub.id });

  // check to find if hub is already in registry.
  self.server.find(hubQuery, function(err, results) {
    if(err) {
      return;
    }

    if (results.length) {
      // merge registry data with instance properties
      var instance = self.provision(results[0], Hub, hueHub);
      if(instance) {
	console.log('initiated device:', instance.id);
	// instance came online, set all scout defined properties that arnt set in constructor
	instance.credentials = results[0].credentials;
      }
    } else {
      console.log('created hue hub');
      // not in registry yet
      self.discover(Hub, hueHub);
    }

    //self.registry.save(instance); // updates registry with new device
    //self.discover(instance); // tell zetta it found a device.

     // self.discover - should check if uuid is already found
      // - if found ignore
      // - if not change status to online, annouce it came online

  });


};
