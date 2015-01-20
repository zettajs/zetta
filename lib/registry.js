var path = require('path');
var calypso = require('calypso');
var LevelDriver = require('calypso-level');
var levelup = require('levelup');
var medeadown = require('medeadown');
var Query = calypso.Query;

var Registry = module.exports = function(opts){
  opts = opts || {};
  this.collection = opts.collection;
  if (opts.db) {
    this.db = opts.db;
  } else {
    var location = path.join(process.cwd(), opts.path);
    this.db = levelup(location, { db: medeadown, valueEncoding: 'json' });
  }

  this.session = null;
};

Registry.prototype._init = function(cb) {
  var self = this;
  var map = {};
  map[this.collection] = this.db;
  var driver = LevelDriver.create({
    collectionMap: map
  });

  var engine = calypso.configure({
    driver: driver
  });

  var self = this;
  engine.build(function(err, connection) {
    if (err) {
      cb(err);
      return;
    }

    self.session = connection.createSession();
    cb();
  });

};

Registry.prototype.match = function(query, value, cb) {
  if (!this.session) {
    var self = this;
    this._init(function(err) {
      if (err) {
        cb(err);
        return;
      }
      self._match(query, value, cb);
    });
  } else {
    this._match(query, value, cb);
  }
};

Registry.prototype._match = function(query, value, cb) {
  cb(null, this.session.match(query, value));
};

Registry.prototype.find = function(query, cb) {
  if (!this.session) {
    var self = this;
    this._init(function(err) {
      if (err) {
        cb(err);
        return;
      }

      self._find(query, cb);
    });
  } else {
    this._find(query, cb);
  }
};

Registry.prototype._find = function(q, cb) {
  var query = Query.of(this.collection);

  if (q instanceof Query) {
    query = q;
  } else if (typeof q === 'object') {
    Object.keys(q).forEach(function(key) {
      query = query.where(key, { eq: q[key] });
    });
  } else {
    query = query.ql(q);
  }

  this.session.find(query, cb);
};


Registry.prototype.get = function(id, cb) {
  this.db.get(id, { valueEncoding: 'json' }, cb);
};

Registry.prototype.close = function() {
  this.db.close.apply(this.db, arguments);
};
