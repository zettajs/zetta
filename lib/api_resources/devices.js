var DevicesResource = module.exports = function(server) {
  this.server = server;
  this.path = '/devices';
};

DevicesResource.prototype.init = function(config) {
  config
    .path(this.path)
    .produces('application/vnd.siren+json')
    .consumes('application/x-www-form-urlencoded')
    .get('/', this.list);
};

DevicesResource.prototype.list = function(env, next) {
  var localServer = {path: '/servers/'+this.server.id };
  var context = { devices: this.server.runtime._jsDevices, loader: localServer, env: env };
  env.format.render('devices', context);
  next(env);
};
