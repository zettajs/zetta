var path = require('path');
var levelup = require('levelup');

var Registry = module.exports = function(db){
  this.db = db || levelup(path.join(process.cwd(), './.registry'));
};

Registry.prototype.find = function(query, cb) {
  var results = [];

  this.db.createReadStream()
    .on('data', function (data) {
      var obj = JSON.parse(data.value);
      if(query.match(obj)) {
	results.push(obj);
      }
    })
    .on('error', cb)
    .on('end', function () {
      cb(null, results);
    });
};


Registry.prototype.get = function(id, cb) {
  this.db.get(id, cb);
};

Registry.prototype.save = function(machine, cb) {
  var json = machine.properties;
  json.id = machine.id; // add id to propertiessy
  this.db.put(machine.id, JSON.stringify(json), cb);
};

Registry.prototype.close = function() {
  this.db.close.apply(this.db, arguments);
};
