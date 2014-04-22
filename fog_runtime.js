var EventEmitter = require('events').EventEmitter;
var util = require('util');
var Rx = require('rx');
var DevicesResource = require('./api_resources/devices');
var FogAppLoader = require('./fog_app_loader');
var Logger = require('./logger');
var Registry = require('./registry');
var RxWrap = require('./observable_rx_wrap');
var Scientist = require('./scientist');

var l = Logger();

var FogRuntime = module.exports = function(argo, scouts) {
  this.argo = argo;
  this.scouts = scouts;
  this.registry = new Registry();
};
util.inherits(FogRuntime, EventEmitter);

FogRuntime.prototype.deviceInRegistry = function(device,compare){
  var found = this.registry.devices.filter(function(b){
    if(b.type !== device.type)
      return false;

    // scout does not provide a compare func.
    if(!compare)
      return device.name === b.name;

    return compare(device,b);
  });
  return found.length !== 0;
};


FogRuntime.prototype.init = function(cb) {
  var self = this;

  self.argo
    .add(DevicesResource, self.registry.devices);

  this.registry.load(function(err){
    if(err){
      l.emit('log', 'fog-device-registry', 'Failed to load registry. Creating a new one.');
      //console.error('Failed to load registry. Creating new one.');
    }
    self.loadScouts(cb);
  });
};

FogRuntime.prototype.loadScouts = function(scouts, cb) {
  if (typeof scouts === 'function') {
    cb = scouts;
    scouts = this.scouts;
  }

  var self = this;
  var count = 0;
  var max = scouts.length;
  scouts.forEach(function(scout) {
    if (typeof scout === 'function') {
      scout = new scout();
    }

    scout.on('discover', function() {
      var machine = Scientist.create.apply(null,arguments);
      var found = self.deviceInRegistry(machine,scout.compare);
      if(!found){
        var initializedMachine = Scientist.init(machine);
        self.registry.add(initializedMachine,function(){
          l.emit('log', 'fog-runtime', 'Device ready '+initializedMachine.type);
          self.emit('deviceready', initializedMachine);

        });
      }
    });

    scout.init(function(err){
      if(err)
        throw err;

      setImmediate(function(){
        self.registry.json_devices.forEach(function(device){
          if(scout.drivers.indexOf(device.type) === -1)
            return;

          var ret = scout.provision(device);
          if(!ret)
            return;

          var machine = Scientist.configure.apply(null,ret);
          self.registry.devices.push(machine);
          l.emit('log', 'fog-runtime', 'Device ready '+machine.type+' initialized from registry');
          self.emit('deviceready', machine);
	  self.registry.save(function(){});
        });
      });
      
    });

    count++;
    if (count == max) {
      cb();
    }

  });
};

FogRuntime.prototype.loadApp = function(resource) {
  this.argo.add(resource);
};

FogRuntime.prototype.loadApps = function(apps, cb) {
  var self = this;
  var length = apps.length;

  var names = [];
  apps.forEach(function(constructor) {
    var app = new constructor();
    var loader = new FogAppLoader(self);
    loader.load(app);
    names.push(app.name);
  });

  cb(names);
};

FogRuntime.prototype.get = function(name, cb) {
  var query = 'name="' + name + '"';
  var observable = this.observe(query).first();

  if (cb) {
    observable
      .catch(function(err) {
        cb(err);
      })
      .subscribe(function(device) {
        cb(null, device);
      });

    return;
  }

  return observable;
};

var observableCallback = function(opts) {
  function fn(observer) {
    // TODO: Make this use a real query language.
    var pair = opts.query.split('=');
    var key = pair[0];
    var value = JSON.parse(pair[1]);

    var devices = opts.registry.devices
      .filter(function(device) {
        return device[key] === value;
      })
      .forEach(function(device) {
        setImmediate(function() {
          observer.onNext(device);
        });
      });

    var getDevice = function(device){
      if(device[key] === value) {
        opts.logger.emit('log', 'fog-runtime', 'Device retrieved '+device.name);
        observer.onNext(device);
      }
    }

    opts.runtime.on('deviceready', getDevice);

    return function() {
      opts.runtime.removeListener('deviceready', getDevice);
    };
  }

  return fn;
};

FogRuntime.prototype.observe = function(query) {
  var options = {
    query: query,
    runtime: this,
    registry: this.registry,
    logger: l
  };

  var observable = Rx.Observable.create(observableCallback(options));

  return RxWrap.create(observable);
};
