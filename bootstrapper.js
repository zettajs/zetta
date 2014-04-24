var fs = require('fs');
var path = require('path');
var argo = require('argo');
var multiparty = require('argo-multiparty');
var spdy = require('spdy');
var siren = require('argo-formatter-siren');
var titan = require('titan');
var CloudClient = require('./cloud_client');
var FogRuntime = require('./fog_runtime');
var Logger = require('./logger');
var PubSubResource = require('./pubsub_resource');
var RegistrationResource = require('./registration_resource.js');

module.exports = function run(appName, parentServer){
  var file = appName || 'app';

  var app = path.resolve(file);
  var dir = path.dirname(app);
  var app = require(app);
  var configPath = path.join(dir, 'config.js');

  //Wire up the logger here.
  var l = Logger();

  var scouts = [];
  try {
    scouts = fs.readdirSync(path.join(dir, 'scouts')).filter(function(scoutPath) {
      if (/^.+\.js$/.test(scoutPath)) {
        return scoutPath;
      }
    }).map(function(scoutPath) {
      return require(path.join(dir, 'scouts', scoutPath));
    });
  } catch(e) {
    l.emit('log', 'fog-bootstrapper', 'Scout directory not found. Skipping.');
    scouts = [];
  }

  var parent = (parentServer || argo());
  var server = parent
    .use(function(handle) {
      handle('request', function(env, next) {
        next(env);
      });
    })
    .use(titan)
    .allow('*')
    .use(multiparty);

  if (!parentServer) {
    server = server 
      .add(PubSubResource);
  }

  server = server
    .format({
      directory : path.join(__dirname,'api_formats'),
      engines: [siren],
      override: {'application/json': siren}
    });
  //.logger();


  l.emit('log', 'fog-bootstrapper', 'bootstrapping fog siren hypermedia API.');
  var fog = new FogRuntime(server, scouts);

  server = server.add(RegistrationResource, fog, dir);

  fs.stat(configPath, function(err, stat) {
    if (!err) {
      var config = require(configPath);
      config(fog);
    }

    fog.init(function(err) {
      var apps = [app];
      fog.loadApps(apps, function(names) {
        var host;
        var shouldRunServer = true;
        if (!parentServer) {
          var host = process.env.ZETTA_CLOUD || 'ws://zetta-cloud.herokuapp.com';
          l.emit('log', 'fog-bootstrapper', 'connecting to cloud endpoint at: '+host+' via websocket');
        } else {
          shouldRunServer = false;
        }
        CloudClient(server, host, names, shouldRunServer, function(server){
          //server.listen(3002);
        });
      });
    });
  });

};
