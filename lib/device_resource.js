var querystring = require('querystring');
var url = require('url');

exports.create = function(loader) {
  var DeviceResource = function() {
    this.path = loader.path;
  };


  DeviceResource.prototype.init = function(config) {
    config.path(this.path)
      .produces('application/vnd.siren+json')
      .consumes('application/x-www-form-urlencoded')
      .consumes('multipart/form-data')
      .get('/', this.home)
      .get('/{splat: (.*)}', this.show)
      .post('/{splat: (.*)}', this.action)
  };

  DeviceResource.prototype.home = function(env, next) {
    var entity = {
      class: ['server'],
      entities: [],
      links: [ { rel: ['self'], href: env.helpers.url.path(this.path) } ]
    };

    Object.keys(loader.exposed).forEach(function(path) {
      var machine = loader.exposed[path];
      entity.entities.push({
        class: ['machine'],
        rel: ['http://rels.zettajs.io/machine'],
        properties: machine.properties,
        links: [ { rel: ['self'], href: env.helpers.url.path(path) } ]
      });
    });

    entity.entities = entity.entities.sort(function(a,b){
      if(a.properties.name < b.properties.name) {
	return -1;
      } else if(a.properties.name > b.properties.name) {
	return 1;
      } else {
	return 0;
      }
    });

    env.response.body = entity;
    next(env);
  };

  DeviceResource.prototype.show = function(env, next) {
    // match path
    // load machine
    // build representation
    // don't forget subdevices



    var machine = loader.exposed[this.path + '/' + env.route.params.splat];
    if (!machine) {
      // return 404
      env.response.statusCode = 404;
      return next(env);
    }



    env.response.body = machine.toSirenEntity(loader, env);
    next(env);
  };

  DeviceResource.prototype.action = function(env, next) {
    var machine = loader.exposed[this.path + '/' + env.route.params.splat];

    if (!machine) {
      env.response.statusCode = 404;
      return next(env);
    }

    var actions = machine.buildActions(env);
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
          var entity = machine.toSirenEntity(loader, env);
          env.response.body = entity;
        }
	
        next(env);
      };

      args.push(cb); 
      machine.call.apply(machine, args);
    }

  };

  return DeviceResource;
};
