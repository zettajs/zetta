const calypso = require('calypso');
const LevelDriver = require('calypso-level');
const levelup = require('levelup');
const medeadown = require('medeadown');
const Query = calypso.Query;
const medea = require('medea');
const async = require('async');

const Registry = module.exports = function(opts){
  opts = opts || {};
  const self = this;
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
  const self = this;

  function buildCalypsoEngine(cb) {
    const map = {};
    map[self.collection] = self.db;
    const driver = LevelDriver.create({
      collectionMap: map
    });

    const engine = calypso.configure({
      driver: driver
    });

    engine.build((err, connection) => {
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
      next => {
        self.compactor.open(self.location, next);
      },
      next => {
        self.compactor.compact(next);
      },
      next => {
        self.compactor.close(next);
      }
    
    ], err => {
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
    const self = this;
    this._init(err => {
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
  let match;
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
    const self = this;
    this._init(err => {
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
  let query = Query.of(this.collection);

  if (q instanceof Query) {
    query = q;
  } else if (typeof q === 'object') {
    Object.keys(q).forEach(key => {
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

  this.session.find(query, (err, results) => {
    if(err) {
      cb(err);
    } else {
      const objects = [];
      results.forEach(peer => {
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
  this.db.get(id, { valueEncoding: 'json' }, (err, result) => {
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
