var MediaType = require('api-media-type');

var DevicesResource = module.exports = function(server) {
  this.server = server;
  this.path = '/devices';
};

DevicesResource.prototype.init = function(config) {
  config
    .path(this.path)
    .produces(MediaType.SIREN)
    .consumes(MediaType.FORM_URLENCODED)
    .get('/', this.list);
};

DevicesResource.prototype.list = function(env, next) {
  var serverId = env.request.headers['zetta-forwarded-server'] || this.server.id;

  var localServer = { path: '/servers/'+ encodeURI(serverId) };
  var context = { devices: this.server.runtime._jsDevices, loader: localServer, env: env };
  env.format.render('devices', context);
  next(env);
};
