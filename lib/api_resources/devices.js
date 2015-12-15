var url = require('url');
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
  var parsed = url.parse(env.request.url);
  var re = /^\/servers\/([^\/]+)/;
  var match = re.exec(parsed.pathname);
  
  var serverId = match && match[1] ? match[1] : this.server.id;

  var localServer = { path: '/servers/'+ encodeURI(serverId) };
  var context = { devices: this.server.runtime._jsDevices, loader: localServer, env: env };
  env.format.render('devices', context);
  next(env);
};
