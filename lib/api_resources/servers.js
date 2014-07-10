var querystring = require('querystring');

var ServerResource = module.exports = function(server) {
  this.server = server;
  this.localServer = {path: '/servers/'+this.server.id };
};

ServerResource.prototype.init = function(config) {
  config
    .path('/servers')
    .produces('application/vnd.siren+json')
    .consumes('application/x-www-form-urlencoded')
    .consumes('multipart/form-data')
    .get('/{serverId}', this.showServer)
    .get('/{serverId}/devices/{deviceId}', this.showDevice)
    .post('/{serverId}/devices/{deviceId}', this.deviceAction);
};

ServerResource.prototype.shouldProxy = function(env) {
  return this.server.id !== env.route.params.serverId;
};

ServerResource.prototype.proxy = function(env, next) {
  return this.server.httpServer.proxyToPeer(env, next);
};

ServerResource.prototype.showServer = function(env, next) {
  if(this.shouldProxy(env)) {
    return this.proxy(env, next);
  }

  //TODO: argo-formatter may want to take multiple arguments for a format. This context obj is a hack.
  var context = { server: this.server, devices: this.server.runtime._jsDevices, loader: this.localServer, env: env };
  env.format.render('server', context);
  next(env);
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

  var model = {
    model: device,
    loader: this.localServer,
    env: env
  };
  env.format.render('device', model);

  next(env);
};

ServerResource.prototype.deviceAction = function(env, next) {
  var self = this;

  if(this.shouldProxy(env)) {
    return this.proxy(env, next);
  }

  var device = this.server.runtime._jsDevices[env.route.params.deviceId];
  if(!device) {
    env.response.body = 'Device does not exist';
    env.response.statusCode = 404;
    return next(env);
  }
  
  var actions = device.buildActions(env);
  if(env.multiparty){
    //Multiparty doesn't parse things out like the qs module. We have to make it consistent.
    var qsObject = {};
    Object.keys(env.multiparty.fields).forEach(function(key) {
      var value = env.multiparty.fields[key];
      if(value.length > 1) {
        qsObject[key] = value;
      } else {
        qsObject[key] = value[0];
      }
    });
    
    Object.keys(env.multiparty.files).forEach(function(key) {
      qsObject[key] = env.multiparty.files[key][0];
    });

    return run(qsObject);
  }else{
    env.request.getBody(function(err, body) {
      body = querystring.parse(body.toString());
      return run(body);
    });
  }

  function run(body){
    if (!body.action) {
      env.response.statusCode = 400;
      return next(env);
    }
    
    var action = actions.filter(function(action) {
     return (action.name === body.action);
    });

    if (!action || !action.length) {
      env.response.statusCode = 400;
      return next(env);
    }

    action = action[0];
    var args = [action.name];

    if (action.fields && action.fields.length) {
      action.fields.forEach(function(field) {
        if (field.name !== 'action') {
          args.push(body[field.name]);
        }
      });
    }

    var cb = function(err) {
      if (err) {
        env.response.statusCode = 500;
      } else {
        var entity = device.toSirenEntityFull(self.localServer, env);
        env.response.body = entity;
      }
      
      next(env);
    };
    
    args.push(cb); 
    device.call.apply(device, args);
  }


};
