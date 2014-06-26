var argo = require('argo');
var titan = require('titan');
var http = require('http');
var Runtime = require('./runtime');

var TestServer = module.exports = function(runtime){
  this.runtime = runtime;

  this.argo = argo()
    .use(titan)
    .allow('*')
    .add(this.runtime.createDeviceResource())
    .build();

  this.server = http.createServer();

  this.server.on('request', this.argo.run);

};

TestServer.prototype.listen = function(/*args*/) {
  this.server.listen.apply(this.server, arguments);
  return this;
};
