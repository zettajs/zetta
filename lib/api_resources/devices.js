var DevicesResource = module.exports = function(server) {
  this.server = server;
  this.path = '/devices';
};

DevicesResource.prototype.init = function(config) {
  config
    .path(this.path)
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



/*
  this.runtime._jsDevices.forEach(function(device) {
    var json = {
      class: ['device'],
      rel: ['http://rels.zettajs.io/device'],
      properties: device,
      links: [
        {
          rel: ['self'],
          href: 'http://zetta-cloud.herokuapp.com/servers/4FB6EA0A-D1F0-4AF0-9F69-A980C55F20D7/devices/A85135B4-5664-4B4F-9DB9-1DBDD28FDC20'
        },
        {
          title:'detroit',
          rel: ['up', 'http://rels.zettajs.io/server'],
          href: 'http://zetta-cloud.herokuapp.com/servers/4FB6EA0A-D1F0-4AF0-9F69-A980C55F20D7'
        }
      ]
    };

    response.entities.push(json);
  });
  */


  env.response.body = response;

  next(env);
};
