var EventEmitter = require('events').EventEmitter;
var util = require('util');
var Rx = require('rx');
var RxWrap = require('./observable_rx_wrap');

var Registry = require('./registry');


var Runtime = module.exports = function() {
  EventEmitter.call(this);
  this.registry = new Registry();
  this.exposed = {};
  this.exposeQuery = null;
};
util.inherits(Runtime, EventEmitter);

//
Runtime.prototype.log = function() {};

// query related
Runtime.prototype.ql = function() {};

//for now we'll just return the JavaScript object.
Runtime.prototype.where = function(params) {
  return params;
};

Runtime.prototype.expose = function(query) {
    this.exposeQuery = query;
}


Runtime.prototype.observe = function(queries, cb) {
  var self = this;
  var observables = [];


  queries.forEach(function(query){
    this._generateObservable(query);
  });


  var firstObservable = observables.shift();
  firstObservable
    .zip(observables, function(){
      return arguments;
    })
    .subscribe(function(args){

      cb.apply(null, Array.prototype.slice.call(args));
    });
};

Runtime.prototype._generateObservable = function(query) {
  var self = this;

  var observableCallback = function(query) {
    function fn(observer) {

      //Here we iteraate through device props for a match.
      var checkDevice = function(device){
        var flag = true;
        Object.keys(query).forEach(function(key){
          flag = flag[key] == query[key];
        });

        if(flag){
          observer.onNext(device);
        }
      }

      self.on('deviceready', checkDevice);

      var observableReturn = function() {
        this.removeListener('deviceready', getDevice)
      }

      return observableReturn;
    }

    return fn;
  }

  var observable = Rx.Observable.create(observableCallback(query));
  observables.push(RxWrap.create(observable));
  return observable;
};

// raw db -
Runtime.prototype.find = function() {};
