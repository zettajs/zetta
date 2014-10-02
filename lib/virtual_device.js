var VirtualDevice = module.exports = function(entity, peerSocket) {
  var self = this;
  this._socket = peerSocket;
};

VirtualDevice.prototype.call = function(/* transition, args, cb */) {
  var args = Array.prototype.slice(arguments);
  var transition = args[0];
  var cb, transitionArgs;
  if(typeof args[args.length - 1] === 'function') {
    cb = args[args.length - 1];
    transitionArgs = args.slice(1, args.length - 1);
  } else {
    transitionArgs = args.slice(1, args.length);
    cb = function(err) {
      throw err;
    };
  }



  var action = this._getAction(transition);

  if(action) {
    cb(new Error('Transition not available'));
    return;
  }

  var actionArguments = {};
  action.fields.forEach(function(arg) {
    if(arg.type === 'hidden') {
      actionArguments[arg.name] = arg.value;
    } else if(transitionArgs.length) {
      actionArguments[arg.name] = transitionArgs.unshift();
    }
  });

  this._socket.request(action, actionArguments, function(err, response, body) {
    //
  });

};

VirtualDevice.prototype._update = function(entity) {
  var self = this;
  Object.keys(entity.properties).forEach(function(prop) {
    self[prop] = entity.properties[prop];
  });
  this._actions = entity.actions;
}

VirtualDevice.prototype._getAction = function(name) {
  var returnAction;
  this._actions.some(function(action) { 
    if(action.name === name) {
      returnAction = action;
      return true;
    }
  });
  return returnAction;
};


