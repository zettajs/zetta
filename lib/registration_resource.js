const fs = require('fs');
const path = require('path');
const url = require('url');
const HTTPScout = require('./http_scout');

const RegistrationResource = module.exports = function(fog, basedir) {
  this.scout = new HTTPScout();
  this.basedir = basedir;
  this.path = '/registration';

  fog.loadScouts([this.scout], () => {});
};

RegistrationResource.prototype.init = function(config) {
  config
    .path(this.path)
    .consumes('application/json')
    .post('/', this.register)
};

RegistrationResource.prototype.register = function(env, next) {
  const self = this;

  env.request.getBody((err, body) => {
    body = JSON.parse(body.toString());
    
    const dir = path.join(self.basedir, 'drivers');
    let found;
    fs.readdir(dir, (err, files) => {
      files.forEach(file => {
        if (!/^.+\.js$/.test(file)) {
          return;
        }

        if (found) {
          return;
        }
        const fullPath = path.join(dir, file);
        const driver = require(fullPath);
        const instance = new driver();

        if (instance.type === body.device.type) {
          self.scout.drivers.push(instance.type);
          self.scout.driverFunctions.push(driver);
          found = driver;
        }
      });

      if (found) {
        self.scout.emit('discover', found, body.device);
        env.response.statusCode = 201;
        const currentUrl = env.helpers.url.current();
        const parsed = url.parse(currentUrl);
        const parsedPath = parsed.pathname.split('/');
        parsedPath.pop();
        parsedPath.push(body.target);
        parsedPath.push(body.device.name);

        parsed.pathname = parsedPath.join('/');
        const endpoint = url.format(parsed);
        env.response.setHeader('Location', endpoint);
      } else {
        env.response.statusCode = 404;
      }

      next(env);
    });
  });
};
