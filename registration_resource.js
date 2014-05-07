var fs = require('fs');
var path = require('path');
var url = require('url');
var HTTPScout = require('./http_scout');
var Scientist = require('./scientist');

var RegistrationResource = module.exports = function(fog, basedir) {
  this.scout = new HTTPScout();
  this.basedir = basedir;
  this.path = '/registration';

  fog.loadScouts([this.scout], function(){});
};

RegistrationResource.prototype.init = function(config) {
  config
    .path(this.path)
    .consumes('application/json')
    .post('/', this.register)
};

RegistrationResource.prototype.register = function(env, next) {
  var self = this;

  env.request.getBody(function(err, body) {
    console.log('err:', err);
    body = JSON.parse(body.toString());
    console.log('registration body:', body);
    
    var dir = path.join(self.basedir, 'drivers');
    var found;
    fs.readdir(dir, function(err, files) {
      files.forEach(function(file) {
        if (!/^.+\.js$/.test(file)) {
          return;
        }

        if (found) {
          return;
        }
        var fullPath = path.join(dir, file);
        var driver = require(fullPath);
        console.log(fullPath);
        var instance = new driver();

        console.log(instance.type);
        console.log(body);
        if (instance.type === body.device.type) {
          self.scout.drivers.push(instance.type);
          self.scout.driverFunctions.push(driver);
          found = driver;
        }
      });

      if (found) {
        //var driver = Scientist.configure(found, body);
        self.scout.emit('discover', found, body.device);
        env.response.statusCode = 201;
        var currentUrl = env.helpers.url.current();
        var parsed = url.parse(currentUrl);
        var parsedPath = parsed.pathname.split('/');
        parsedPath.pop();
        parsedPath.push(body.target);
        parsedPath.push(body.device.name);

        parsed.pathname = parsedPath.join('/');
        var endpoint = url.format(parsed);
        env.response.setHeader('Location', endpoint);
      } else {
        env.response.statusCode = 404;
      }

      console.log('headers:', env.request.headers);
      console.log('calling next with code:', env.response.statusCode);
      next(env);
    });
  });
};
