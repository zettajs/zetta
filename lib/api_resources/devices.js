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
  var response = {
    class: ['devices'],
    entities: [],
    links: [
      { rel: ["self"], href: env.helpers.url.path(this.path)}
    ]
  };
  
  // add local devices to response
  var localServer = {path: '/servers/'+this.server.id };
  var localDevices = this.server.runtime._jsDevices;
  Object.keys(localDevices).forEach(function(id) {  
    response.entities.push(localDevices[id].toSirenEntity(localServer ,env));
  });

  env.response.body = response;
  next(env);
};
