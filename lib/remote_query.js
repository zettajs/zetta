var Query = require('calypso').Query;

var RemoteQuery = module.exports = function(server, query) {
  this.server = server;
  this.query = query;
};

Object.keys(Query.prototype).forEach(function(key) {
  RemoteQuery.prototype[key] = function() {
    var args = Array.prototype.slice.call(arguments);
    return this.query[key].apply(this.query, args);
  };
});
