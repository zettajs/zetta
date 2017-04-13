const url = require('url');
const MediaType = require('api-media-type');

class DevicesResource {
  constructor(server) {
    this.server = server;
    this.path = '/devices';
  }

  init(config) {
    config
      .path(this.path)
      .produces(MediaType.SIREN)
      .consumes(MediaType.FORM_URLENCODED)
      .get('/', this.list);
  }

  list(env, next) {
    const parsed = url.parse(env.request.url);
    const re = /^\/servers\/([^\/]+)/;
    const match = re.exec(parsed.pathname);
    
    const serverId = match && match[1] ? match[1] : this.server.id;

    const localServer = { path: `/servers/${encodeURI(serverId)}` };
    const context = { devices: this.server.runtime._jsDevices, loader: localServer, env };
    env.format.render('devices', context);
    next(env);
  }
}

module.exports = DevicesResource;
