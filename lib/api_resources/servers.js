var ServerResource = module.exports = function(server) {
  this.server = server;
  this.localServer = {path: '/servers/'+this.server.id };

};

ServerResource.prototype.init = function(config) {
  config
    .path('/servers')
    .get('/{serverId}', this.showServer)
    .get('/{serverId}/devices/{deviceId}', this.showDevice)
    .post('/{serverId}/devices/{deviceId}', this.deviceAction);
};

ServerResource.prototype.shouldProxy = function(env) {
  return this.server.id !== env.route.params.serverId;
};

ServerResource.prototype.proxy = function(env, next) {
  env.response.statusCode = 404;
  env.response.body = 'Proxy not supported yet.';
  next(env);
};

ServerResource.prototype.showServer = function(env, next) {
  if(this.shouldProxy(env)) {
    return this.proxy(env, next);
  }

  var body = {
    class: ['server'],
    properties: {
      id: this.server.id,
      name: this.server._name
    },
    entities: [],
    links: [
      { rel: ['self'], href: env.helpers.url.current() },
      { rel: ['monitor'], href: env.helpers.url.path('/servers/' + this.server.id + '/logs') }
    ]
  };

  body.entities = this.buildLocalDevices(env);

  env.response.body = body;
  next(env);
};

ServerResource.prototype.buildLocalDevices = function(env) {
  var self = this;
  var devices = [];
  var localDevices = this.server.runtime._jsDevices;

  Object.keys(localDevices).forEach(function(id) {  
    devices.push(localDevices[id].toSirenEntity(self.localServer ,env));
  });

  return devices;
};


ServerResource.prototype.showDevice = function(env, next) {
  if(this.shouldProxy(env)) {
    return this.proxy(env, next);
  }
  
  var device = this.server.runtime._jsDevices[env.route.params.deviceId];
  if(!device) {
    env.response.body = 'Device does not exist';
    env.response.statusCode = 404;
    return next(env);
  }

  env.response.body = device.toSirenEntityFull(this.localServer, env);

  next(env);
};

ServerResource.prototype.deviceAction = function(env, next) {
  var serverId = env.route.params.serverId;
  var deviceId = env.route.params.deviceId;
  env.response.body = {serverId: serverId, deviceId: deviceId};
  next(env);
};
