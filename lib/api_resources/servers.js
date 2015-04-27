var querystring = require('querystring');
var MediaType = require('api-media-type');

var ServerResource = module.exports = function(server) {
  this.server = server;
};

ServerResource.prototype.getServer = function(env) {
  var serverId = env.request.headers['zetta-forwarded-server'] || this.server.id;

  return { path: '/servers/' + encodeURI(serverId) };
};

ServerResource.prototype.init = function(config) {
  config
    .path('/servers')
    .produces(MediaType.SIREN)
    .consumes(MediaType.FORM_URLENCODED)
    .consumes(MediaType.MULTIPART_FORM_DATA)
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

  if (env.route.query.ql) {
    return this._queryDevices(env, next);
  }

  //TODO: argo-formatter may want to take multiple arguments for a format. This context obj is a hack.
  var context = { server: this.server, devices: this.server.runtime._jsDevices, loader: this.getServer(env), env: env };
  env.format.render('server', context);
  next(env);
};

ServerResource.prototype._queryDevices = function(env, next) {
  var params = env.route.query;
  var self = this;

  if(!params.ql) {
    env.response.statusCode = 404;
    return next(env);
  } else {
    var results = [];

    var query = self.server.runtime.ql(params.ql);
    var keys = Object.keys(self.server.runtime._jsDevices);
    var max = keys.length - 1;
    var hasError = false;

    keys.forEach(function(key, i) {
      var device = self.server.runtime._jsDevices[key];

      if (hasError) {
        return;
      }

      self.server.runtime.registry.match(query, device, function(err, match) {
        if (err) {
          env.response.statusCode = 500;
          hasError = true;
          return next(env);
        }

        if (match) {
          results.push(match);
        }

        if (i === max) {
          done();
        }
      });
    });

    function done() {
      var devices = {};
        
      results.forEach(function(device){
        var deviceOnRuntime = self.server.runtime._jsDevices[device.id];
        if (deviceOnRuntime) {
          devices[device.id] = deviceOnRuntime;
        }
      });

      var context = {
        server: self.server,
        devices: devices,
        loader: self.getServer(env),
        env: env,
        classes:['search-results'],
        query: params.ql 
      };

      env.format.render('server', context);
      next(env);
    };
  }
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
    loader: this.getServer(env),
    serverName: this.server._name,
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
  
  env.request.getBody(function(err, body) {
    if (err || !body) {
      env.response.statusCode = 400;
      next(env);
      return;
    }

    body = querystring.parse(body.toString());
    return run(body);
  });

  function run(body){
    if (!body.action) {
      env.response.statusCode = 400;
      return next(env);
    }
    
    var action = device._transitions[body.action];
    if (!action) {
      env.response.statusCode = 400;
      return next(env);
    }

    if(!device.available(body.action)) {
      env.response.statusCode = 400;
      return next(env);
    }
    

    // device.call(actionName, arg1, arg2, argn, cb);
    var args = [body.action];

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
        var model = {
          model: device,
          loader: self.getServer(env),
          serverName: self.server._name,
          env: env
        };
        env.format.render('device', model);
      }
      
      next(env);
    };
    
    args.push(cb); 
    device.call.apply(device, args);
  }
};

