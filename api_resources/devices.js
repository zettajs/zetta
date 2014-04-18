var DeviceModel = require('../api_models/device');
var DevicesModel = require('../api_models/devices');

var Devices = module.exports = function(devices) {
  
  this.devices = devices;

  this.path = '/_devices';
};

Devices.prototype.init = function(config) {
  config
    .path(this.path)
    .consumes('application/json')
    .produces('application/vnd.siren+json')
    .get('/', this.list)
    .get('/{id}', this.getDevice)
    .post('/', this.register);
   // .del('/{id}', this.del)
   // .put('/{id}', this.fullUpdate)
   // .patch('/{id}', this.partialUpdate)
};

Devices.prototype.list = function(env, next) {
  var urlHelper = env.helpers.url;
  var self = this;

  var i = 0;
  var devices = this.devices.map(function(device){
    return device;
  });

  var items = devices.map(function(device) {
    var entity = DeviceModel.create({
      name: device.name,
      selfUrl: urlHelper.join(device.name+''),
      collectionUrl: urlHelper.path(self.path)
    });

    return entity;
  });

  var DeviceList = DevicesModel.create({
    entities: items,
    selfUrl: urlHelper.current()
  });

  env.format.render('devices', DeviceList);
  next(env);
};

Devices.prototype.getDevice = function(env, next) {
  var id = env.route.params.id;
  var urlHelper = env.helpers.url;
  var device = null;

  this.devices.forEach(function(d) {
    if(d.name === id) {
      device = d;
    }
  });

  if(device) {
    var entity = DeviceModel.create({
      name: device.name,
      selfUrl: urlHelper.join(device.name),
      collectionUrl: urlHelper.path(this.path)
    });

    env.format.render('device', entity);
    next(env);
  } else {
    env.response.body = { 'error': 'NOT FOUND!' };
    env.response.statusCode = 404;
    next(env);
  }
};

Devices.prototype.register = function(env, next) {
  var self = this;
  var urlHelper = env.helpers.url;
  env.request.getBody(function(err, body) {
    if(err) {
      env.response.body = {'error': 'NO BODY'};
      env.response.statusCode = 500;
      next(env);
    } else {
      var b = JSON.parse(body.toString());
      var device = {
        name: b.name,
        id:this.devices.length + 1
      };

      this.devices.push(device);

      var entity = DeviceModel.create({
        name: device.name,
        selfUrl: urlHelper.join(device.name),
        collectionUrl: urlHelper.path(self.path)
      });

      env.format.render('device', entity);
      next(env);
    }
  });
};
