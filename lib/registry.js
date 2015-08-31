var calypso = require('calypso');
var LevelDriver = require('calypso-level');
var levelup = require('levelup');
var medeadown = require('medeadown');
var Query = calypso.Query;
var medea = require('medea');
var async = require('async');

var Registry = module.exports = function(opts){
  opts = opts || {};
  var self = this;
  this.collection = opts.collection;
  if (opts.db) {
    this.db = opts.db;
  } else {
    this.location = opts.path;
    this.compactor = medea();
  }

  this.session = null;
};

Registry.prototype._init = function(cb) {
  var self = this;

  function buildCalypsoEngine(cb) {
    var map = {};
    map[self.collection] = self.db;
    var driver = LevelDriver.create({
      collectionMap: map
    });

    var engine = calypso.configure({
      driver: driver
    });

    engine.build(function(err, connection) {
      if (err) {
        cb(err);
        return;
      }

      self.session = connection.createSession();
      cb();
    });

  }

  if(this.compactor) {
    async.series([
      function(next) {
        self.compactor.open(self.location, next);
      },
      function(next) {
        self.compactor.compact(next);
      },
      function(next) {
        self.compactor.close(next);
      }
    
    ], function(err) {
      if(err) {
        cb(err);
      } else {
        self.db = levelup(self.location, { db: medeadown, valueEncoding: 'json' });
        buildCalypsoEngine(cb);
      }  
    });
  } else {
    buildCalypsoEngine(cb);
  }
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
  var match;
  try {
    match = this.session.match(query, value);
  } catch (err) {
    cb(err);
    return;
  }
  cb(null, match);
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

  // run a match to test if the query is valid
  try {
    this.session.match(query, {});
  } catch(err) {
    return cb(err);
  }

  this.session.find(query, function(err, results) {
    if(err) {
      cb(err);
    } else {
      var objects = [];
      results.forEach(function(peer) {
        if(typeof peer === 'string') {
          peer = JSON.parse(peer);
        }
        objects.push(peer);
      });
      cb(null, objects);
    }
  });
};


Registry.prototype.get = function(id, cb) {
  this.db.get(id, { valueEncoding: 'json' }, function(err, result){
    if(err) {
      cb(err);
    } else {
      if(typeof result === 'object') {
        cb(null, result);
      } else {
        cb(null, JSON.parse(result));
      }
    }
  });
};

Registry.prototype.close = function() {
  this.db.close.apply(this.db, arguments);
};

Registry.prototype.remove = function(obj, cb) {
  this.db.del(obj.id, cb);  
};
